import * as Types from "../Types"
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection"
import { AxiosRequestConfig } from "axios"
import _ from "lodash"
import { CreateAssertion } from "../Assertions"
import qs from "qs"
import moment from "moment"
import { axios } from "../../../../Common/Axios/axios"
import winston from "winston"

export const FetchTokens = async (logger:winston.Logger,cert:ClientCertificateInjector, $:{
  Consent: Types.ConsentRequestLog,
  AuthCode?: string,
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {
  let additionalParams = <any>{}

  const grantParams:Types.TokenGrantParams = $.AuthCode ? {grant_type:"authorization_code", code: $.AuthCode} : {grant_type:"refresh_token"};

  if (grantParams.grant_type == 'refresh_token') {
      additionalParams["refresh_token"] = $.Consent.refreshToken
  }

  if (grantParams.grant_type == 'authorization_code') {
      additionalParams["redirect_uri"] = $.Consent.redirectUri
  }

  let options:AxiosRequestConfig = {
      method:'POST',
      url: $.DataHolderOidc.token_endpoint,
      responseType: "json",
      data: qs.stringify(_.merge(grantParams,{
          "client_id":$.CheckAndUpdateClientRegistration.clientId,
          "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId,$.DataHolderOidc.token_endpoint,$.DataRecipientJwks),
      },additionalParams))
  }

  cert.inject(options);
  const tokenRequestTime = moment.utc().toDate();
  let response = await axios.request(options);

  let responseObject:Types.TokenResponse = response.data;

  // Log the response so that manual recover can occur in the case or exceptions before/during persisting new tokens
  logger.info({
      consentId: $.Consent.id,
      existingAuth: additionalParams,
      tokenResponse: responseObject
  })

  return {
      tokenResponse:responseObject,
      tokenRequestTime
  }

}