import { JWT, JWK } from "jose";
import _ from "lodash"
import { Dictionary } from "../../../Common/Server/Types";
import { URL } from "url";
import * as Types from "../../../Common/Connectivity/Types"
import { ConsentRequestParams } from "../../../Common/Connectivity/Types";
import { AxiosRequestConfig } from "axios";
import { axios } from "../../../Common/Axios/axios";
import qs from "qs"
import { ClientCertificateInjector } from "../../../Common/Services/ClientCertificateInjection";
import { CreateAssertion } from "../../../Common/Connectivity/Assertions";

interface AuthSignatureRequest {
  adrSigningJwk: JWK.Key,
  clientId: string,
  existingArrangementId?: string,
  callbackUrl: string,
  scopes: string[],
  additionalClaims?: {
    userinfo?: Dictionary<any>,
    id_token?: Dictionary<any>,
  }
  authorizeEndpointUrl: string,
  sharingDuration: number
  nonce: string
  state: string
  issuer: string
}

const FetchRequestUri = async (cert: ClientCertificateInjector, signed:string, $: {
  DataHolderOidc: Types.DataholderOidcResponse,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration,
  DataRecipientJwks: Types.JWKS.KeyStore
}, queryParams : {
  scope: string,
  response_type: string
}) => {

  const url = $.DataHolderOidc.pushed_authorization_request_endpoint;

  const data = qs.stringify(_.merge({
    request: signed
  },{
    "client_id": $.CheckAndUpdateClientRegistration.clientId,
    "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, url, $.DataRecipientJwks),
    scope: queryParams.scope,
    response_type: queryParams.response_type
  }))

  let options: AxiosRequestConfig = {
    method: 'POST',
    url,
    data,
    responseType: "json",
  }

  options = cert.inject({
    softwareProductId:$.SoftwareProductConfig.ProductId,
    ...options
  });

  let response = await axios.request(options);
 
  return {request_uri: response.data.request_uri}
}

export const getAuthPostGetRequestUrl = async (cert: ClientCertificateInjector, req: AuthSignatureRequest, $: {
  ConsentRequestParams: ConsentRequestParams,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration,
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig,
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderBrandMetadata: Types.DataHolderRegisterMetadata
}) => {

  let url = new URL(req.authorizeEndpointUrl);

  if (url.protocol != 'https:') throw 'Cannot create an authorization request for a non-https endpoint.'

  let queryParams = {
    response_type: "code id_token",
    client_id: req.clientId,
    redirect_uri: req.callbackUrl,
    scope: req.scopes.join(" "),
    nonce: req.nonce,
    state: req.state,
  }

  for (let [k, v] of Object.entries(queryParams)) {
    url.searchParams.append(k, v);
  }

  const acrSpec = { // TODO abstract out as a parameter to POST /cdr/consents
    "essential": true,
    "values": ["urn:cds.au:cdr:2"]
  }

  let claimsPart = {
    "claims": {
      "sharing_duration": req.sharingDuration,
      "userinfo": {
        "acr": acrSpec,
        "refresh_token_expires_at": { "essential": true },
        "cdr_arrangement_id": { "essential": true }
      },
      "id_token": {
        "acr": acrSpec,
        "refresh_token_expires_at": { "essential": true },
        "cdr_arrangement_id": { "essential": true }
      }
    }
  };

  // merge in once-off additional claims
  _.merge(claimsPart.claims.userinfo, req.additionalClaims?.userinfo)
  _.merge(claimsPart.claims.id_token, req.additionalClaims?.id_token)

  // add the existing arrangement ID if supplied
  if (req.existingArrangementId) {
    (<any>claimsPart).claims.cdr_arrangement_id = req.existingArrangementId
  }

  let payload = _.merge(queryParams, claimsPart);

  const signingOptions = {
    algorithm: 'PS256',
    audience: req.issuer,
    expiresIn: '1 hour',
    header: {
      typ: 'JWT'
    },
    issuer: req.clientId
  }

  const signed = JWT.sign(
    payload,
    req.adrSigningJwk,
    signingOptions
  )

  let usePar: boolean = false;
  if ($.DataHolderOidc.pushed_authorization_request_endpoint) {
    if ($.AdrConnectivityConfig.UsePushedAuthorizationRequest || req.existingArrangementId) {
      usePar = true;
    }
  }

  if (usePar) {
    const {request_uri} = await FetchRequestUri(cert,signed,$,payload)
    url.searchParams.append('request_uri', request_uri);
  } else {
    url.searchParams.append('request', signed);
  }

  return url.toString();

}