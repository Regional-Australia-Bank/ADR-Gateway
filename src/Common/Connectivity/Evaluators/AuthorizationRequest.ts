import { AdrConnectivityConfig } from "../../Config";
import * as Types from "../Types"
import uuid = require("uuid")
import _ from "lodash"
import { ConsentRequestLogManager } from "../../Entities/ConsentRequestLog";
import { getAuthPostGetRequestUrl } from "../../../AdrGateway/Server/Helpers/HybridAuthJWS";

export interface ConsentRequestParams {
  sharingDuration: number,
  state: string,
  systemId: string,
  userId: string,
  scopes: string[],
  dataholderBrandId: string,
  productKey: string,
  additionalClaims?: AdrConnectivityConfig["DefaultClaims"]
}

export const GetAuthorizationRequest = async (consentManager:ConsentRequestLogManager,$:{
  ConsentRequestParams: ConsentRequestParams,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration,
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig,
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderBrandMetadata: Types.DataHolderRegisterMetadata
}) => {
  let p = $.ConsentRequestParams;

  // populate the the OAuth2 hybrid flow request params (userId: string, scopes: string[])

  const stateParams = {
    nonce: uuid.v4(),
    state: p.state || uuid.v4()
  }

  // ensure the openin scope is included
  const requestedScopes = _.uniqBy(_.union(["openid"],p.scopes),e=>e);

  let additionalClaims = {
      userinfo: _.merge($.AdrConnectivityConfig.DefaultClaims?.userinfo, p.additionalClaims?.userinfo),
      id_token: _.merge($.AdrConnectivityConfig.DefaultClaims?.id_token, p.additionalClaims?.id_token)
  }

  let redirectUri = $.SoftwareProductConfig.redirect_uris[0];

  // sign with JWT
  let authUrl = getAuthPostGetRequestUrl({
      clientId: $.CheckAndUpdateClientRegistration.clientId,
      callbackUrl: redirectUri,
      sharingDuration: p.sharingDuration || 0,
      issuer: $.DataHolderOidc.issuer,
      authorizeEndpointUrl: $.DataHolderOidc.authorization_endpoint,
      scopes: requestedScopes,
      adrSigningJwk: $.DataRecipientJwks.get({use:'sig',alg:"PS256"}),
      nonce: stateParams.nonce,
      state: stateParams.state,
      additionalClaims
  });

  // log to the DB
  let logManager = consentManager;
  let newConsent = await logManager.LogAuthRequest({
      adrSystemId: p.systemId,
      adrSystemUserId: p.userId,
      dataHolderId: p.dataholderBrandId,
      productKey: p.productKey,
      softwareProductId: $.SoftwareProductConfig.ProductId,
      requestedSharingDuration: p.sharingDuration || 0,
      nonce: stateParams.nonce,
      state: stateParams.state,
      scopes: requestedScopes,
      redirectUri
  });

  // return the redirect URI to the caller

  return {redirectUrl: authUrl, consentId:newConsent.id, softwareProductId: newConsent.softwareProductId};

}