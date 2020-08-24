import * as Types from "../Types"
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AxiosRequestConfig } from "axios";
import qs from "qs";
import { CreateAssertion } from "../../Connectivity/Assertions";
import moment from "moment";
import { axios } from "../../Axios/axios";
import { ConsentRequestLogManager } from "../../Entities/ConsentRequestLog";
import winston from "winston";

export const PropagateRevokedConsent = async (logger:winston.Logger, cert: ClientCertificateInjector, consentManager: ConsentRequestLogManager, $:{
  Consent: Types.ConsentRequestLog, 
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {

  if (!$.Consent.refreshToken) throw 'ConsentRevocation: consent has no refreshToken';
        
  let options:AxiosRequestConfig = {
      method:'POST',
      url: $.DataHolderOidc.revocation_endpoint,
      responseType: "json",
      data: qs.stringify({
          "token_type_hint":"refresh_token",
          "token":$.Consent.refreshToken,
          "client_id":$.CheckAndUpdateClientRegistration.clientId,
          "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId,$.DataHolderOidc.revocation_endpoint,$.DataRecipientJwks),
      })
  }
  
  cert.inject(options);
  const tokenRequestTime = moment.utc().toDate();
  let response = await axios.request(options);
  
  let responseObject:Types.TokenResponse = response.data;
  
  if (response.status !== 200) throw 'Revocation was not successful'
  
  logger.info({
      date: moment().toISOString(),
      consentRevoked: $.Consent
  })
  
  let updatedConsent = await consentManager.MarkRevoked($.Consent);
  return updatedConsent;

}

