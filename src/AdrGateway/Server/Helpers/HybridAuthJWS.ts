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
import moment from 'moment'
import { setAuthState, getAuthState, generateCodeVerifier, sha256CodeVerifier } from '../../../Common/SecurityProfile/Util'

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

const FetchRequestUri = async (cert: ClientCertificateInjector, signed: string, $: {
  DataHolderOidc: Types.DataholderOidcResponse,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration,
  DataRecipientJwks: Types.JWKS.KeyStore
}, queryParams: {
  scope: string,
  response_type: string,
  code_challenge: string,
  code_challenge_method: string
}) => {

  const url = $.DataHolderOidc.pushed_authorization_request_endpoint;

  const data = qs.stringify(_.merge({
    request: signed
  }, {
    "client_id": $.CheckAndUpdateClientRegistration.clientId,
    "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, url, $.DataRecipientJwks),
    scope: queryParams.scope,
    response_type: queryParams.response_type,
    "code_challenge": queryParams.code_challenge,
    "code_challenge_method": queryParams.code_challenge_method
  }))

  let options: AxiosRequestConfig = {
    method: 'POST',
    url,
    data,
    responseType: "json",
  }

  cert.inject(options, $.SoftwareProductConfig.ProductId);
  let response = await axios.request(options);
  return { request_uri: response.data.request_uri }
}

// For future PKCE full implementation

// export const RetreiveIdTokenWithPKCEFlow = async (cert: ClientCertificateInjector, $: {
//   DataHolderOidc: Types.DataholderOidcResponse,
//   SoftwareProductConfig: Types.SoftwareProductConnectivityConfig,
//   clientId: string,
// }, queryParams: {
//   code_verifier: string,
//   code: string
// }) => {

//   const url = $.DataHolderOidc.token_endpoint;

//   const data = qs.stringify({
//     "client_id": $.clientId,
//     "code_verifier": queryParams.code_verifier,
//     "grant_type": 'authorization_code',
//     "code": queryParams.code
//   })

//   let options: AxiosRequestConfig = {
//     method: 'POST',
//     url,
//     data,
//     responseType: "json",
//   }

//   cert.inject(options, $.SoftwareProductConfig.ProductId);
//   let response = await axios.request(options);
//   return { id_token: response.data.id_token }
// }

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

  // support PKCE 
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = sha256CodeVerifier(codeVerifier);
  await setAuthState(req.state, codeVerifier, codeChallenge); // store these for later 

  let pkceQueryParams = {
    response_type: "code id_token", // backward support for id_token
    client_id: req.clientId,
    redirect_uri: req.callbackUrl,
    scope: req.scopes.join(" "),
    nonce: req.nonce,
    state: req.state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }

  // hybrid auth flow
  // let queryParams = {
  //   response_type: "code id_token",
  //   client_id: req.clientId,
  //   redirect_uri: req.callbackUrl,
  //   scope: req.scopes.join(" "),
  //   nonce: req.nonce,
  //   state: req.state,
  // }

  for (let [k, v] of Object.entries(pkceQueryParams)) {
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
        "refresh_token_expires_at": { "essential": false },
        "cdr_arrangement_id": { "essential": true }
      },
      "id_token": {
        "acr": acrSpec,
        "refresh_token_expires_at": { "essential": false },
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

  let payload = _.merge(pkceQueryParams, claimsPart);

  // change to let to allow adding of Not before
  let signingOptions: { algorithm: string, audience: string, expiresIn: string, header: object, issuer: string, notBefore?: string } = {
    algorithm: 'PS256',
    audience: req.issuer,
    expiresIn: '1 hour',
    header: {
      typ: 'JWT'
    },
    issuer: req.clientId,
    notBefore: '0s' // NBF bug 2919 //
  }

  let usePar: boolean = false;
  if ($.DataHolderOidc.pushed_authorization_request_endpoint) {
    if ($.AdrConnectivityConfig.UsePushedAuthorizationRequest || req.existingArrangementId) {
      usePar = true;
    }
  }

  const signed = JWT.sign(
    payload,
    req.adrSigningJwk,
    signingOptions
  )

  if (usePar) {
    const { request_uri } = await FetchRequestUri(cert, signed, $, payload)
    url.searchParams.append('request_uri', request_uri);
  } else {
    url.searchParams.append('request', signed);
  }

  return url.toString();

}