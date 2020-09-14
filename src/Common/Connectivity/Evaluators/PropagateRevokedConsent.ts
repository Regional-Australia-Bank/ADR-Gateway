import * as Types from "../Types"
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AxiosRequestConfig } from "axios";
import qs from "qs";
import { CreateAssertion } from "../../Connectivity/Assertions";
import moment from "moment";
import { axios } from "../../Axios/axios";
import { ConsentRequestLogManager } from "../../Entities/ConsentRequestLog";
import winston from "winston";
import urljoin from "url-join";

export const PropagateRevokedConsent = async (logger: winston.Logger, cert: ClientCertificateInjector, consentManager: ConsentRequestLogManager, $: {
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  Consent: Types.ConsentRequestLog,
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration,
  FetchTokens: {tokenResponse:Types.TokenResponse, tokenRequestTime:Date}
}) => {

  if (!$.Consent.refreshToken) throw 'ConsentRevocation: consent has no refreshToken';

  const useArrangementManagement = $.DataHolderOidc.cdr_arrangement_endpoint && $.Consent.arrangementId && $.AdrConnectivityConfig.UseDhArrangementEndpoint

  if (useArrangementManagement) {
    
    let url = urljoin($.DataHolderOidc.cdr_arrangement_endpoint,$.Consent.arrangementId)

    let options: AxiosRequestConfig = {
      method: 'DELETE',
      url,
      headers: {
        "Authorization": "Bearer " + $.FetchTokens.tokenResponse.access_token,
        "content-type": "application/x-www-form-urlencoded"
      },
      responseType: "json",
      data: qs.stringify({
        "client_id": $.CheckAndUpdateClientRegistration.clientId,
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, url, $.DataRecipientJwks),
      })
    }

    cert.inject(options);
    let response = await axios.request(options);

    if (!response.status.toString().startsWith("2")) throw 'Revocation was not successful'

  } else {
    let options: AxiosRequestConfig = {
      method: 'POST',
      url: $.DataHolderOidc.revocation_endpoint,
      responseType: "json",
      data: qs.stringify({
        "token_type_hint": "refresh_token",
        "token": $.Consent.refreshToken,
        "client_id": $.CheckAndUpdateClientRegistration.clientId,
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, $.DataHolderOidc.revocation_endpoint, $.DataRecipientJwks),
      })
    }

    cert.inject(options);
    let response = await axios.request(options);

    if (!response.status.toString().startsWith("2")) throw 'Revocation was not successful'

  }

  logger.info({
    date: moment().toISOString(),
    consentRevoked: $.Consent
  })

  let updatedConsent = await consentManager.MarkRevoked($.Consent);
  return updatedConsent;

}

