import * as Types from "../Types"
import _ from "lodash"
import moment from "moment"
import { ValidateIdToken } from "./ValidateIdToken"
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog"
import { GetUserInfo } from "./UserInfo"
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"

export const UpdateClaims = async (cert:ClientCertificateInjector,consentManager:ConsentRequestLogManager,$:{
  FetchTokens:{
      tokenResponse: Types.TokenResponse
      tokenRequestTime: Date
  },
  Consent: ConsentRequestLog
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderJwks: Types.JWKS.KeyStore,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {
  let newClaims:{refresh_token_expires_at:number,sharing_expires_at?:number,cdr_arrangement_id?:string};
  let idToken:{refresh_token_expires_at:number,sharing_expires_at?:number,cdr_arrangement_id?:string}|undefined = undefined;

  // Update claims using the id token if present
  if (typeof $.FetchTokens.tokenResponse.id_token == 'string') {
      newClaims = await ValidateIdToken($.FetchTokens.tokenResponse.id_token,$)
      idToken = newClaims;
  } else {
      // otherwise, we need to get claims from user_info endpoint
      try {
        newClaims = await GetUserInfo(cert,_.merge({},$,{AccessToken: $.FetchTokens.tokenResponse.access_token}))
      } catch (e) {
          // if for some reason the user_info endpoint is not available, save the new tokens. Assume a 28 day (minus a bit) refresh token expiry
          newClaims = {
              refresh_token_expires_at: moment.utc().add(27,'days').unix(),
              sharing_expires_at: undefined
          }                
      }
  }

  const cdr_arrangement_id = ($.FetchTokens.tokenResponse.cdr_arrangement_id || idToken?.cdr_arrangement_id) || undefined;

  const manifest = {
    consentId: $.Consent.id,
    params: _.pick($.FetchTokens.tokenResponse,['access_token','token_type','expires_in','refresh_token','scope']),
    tokenRequestTime:$.FetchTokens.tokenRequestTime,
    sharingEndDate:newClaims.sharing_expires_at,
    refreshTokenExpiry:newClaims.refresh_token_expires_at,
    idTokenJson:idToken && JSON.stringify(idToken),
    cdr_arrangement_id:cdr_arrangement_id,
  }

  let updatedConsent = await consentManager.UpdateTokens(manifest);
  return updatedConsent;

}