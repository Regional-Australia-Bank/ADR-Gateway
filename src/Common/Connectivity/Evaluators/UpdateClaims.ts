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
  const existingClaims = $.Consent.ExistingClaims();
  let knownClaims:{refresh_token_expires_at?:number,sharing_expires_at?:number,cdr_arrangement_id?:string,sub?:string} = _.merge({},existingClaims);

  // Update claims using the id token if present
  if (typeof $.FetchTokens.tokenResponse.id_token == 'string') {
    knownClaims = _.merge(knownClaims,ValidateIdToken($.FetchTokens.tokenResponse.id_token,$))
  } else {
      // otherwise, we need to get claims from user_info endpoint
      try {
        knownClaims = _.merge(knownClaims,await GetUserInfo(cert,_.merge({},$,{AccessToken: $.FetchTokens.tokenResponse.access_token})))
      } catch (e) {
        // do not fail on a GetUserInfo error
      }
  }

  const cdr_arrangement_id = ($.FetchTokens.tokenResponse.cdr_arrangement_id || knownClaims?.cdr_arrangement_id) || undefined;

  const sharingEndDate = knownClaims.sharing_expires_at;

  let refreshTokenExpiry = knownClaims.refresh_token_expires_at || moment.utc().add(27,'days').unix();
  if (sharingEndDate && refreshTokenExpiry > sharingEndDate) {
    refreshTokenExpiry = sharingEndDate
  }

  const manifest = {
    consentId: $.Consent.id,
    params: _.pick($.FetchTokens.tokenResponse,['access_token','token_type','expires_in','refresh_token','scope']),
    tokenRequestTime:$.FetchTokens.tokenRequestTime,
    sharingEndDate,
    refreshTokenExpiry,
    claims: knownClaims,
    cdr_arrangement_id:cdr_arrangement_id,
  }

  let updatedConsent = await consentManager.UpdateTokens(manifest);
  return updatedConsent;

}