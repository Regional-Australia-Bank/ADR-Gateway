import * as Types from "../Types"
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"
import { AxiosRequestConfig, AxiosResponse } from "axios"
import _ from "lodash"
import { CreateAssertion } from "../../Connectivity/Assertions"
import qs from "qs"
import moment from "moment"
import { axios } from "../../Axios/axios"
import winston from "winston"
import { ConsentRequestLogManager } from "../../Entities/ConsentRequestLog"

export const SyncRefreshTokenStatus = async (consentManager:ConsentRequestLogManager, logger: winston.Logger, cert: ClientCertificateInjector, $: {
    Consent: Types.ConsentRequestLog,
    DataRecipientJwks: Types.JWKS.KeyStore,
    DataHolderOidc: Types.DataholderOidcResponse,
    CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}):Promise<Types.RefreshTokenStatus> => {

    // if we don't have a refresh token, nothing to do
    if (!$.Consent.refreshToken) {
        return;
    }

    // otherwise, we want to check and return it's status

    // If we know it has already timed out, say so directly
    if (!$.Consent.HasCurrentRefreshToken()) {
        await consentManager.RevokeConsent($.Consent,"DataHolder");
        return {
            active: false
        }
    }

    // If it may still be current, check at the introspection endpoint

    let options: AxiosRequestConfig = {
        method: 'POST',
        url: $.DataHolderOidc.introspection_endpoint,
        responseType: "json",
        data: qs.stringify({
            "token_type_hint":"refresh_token",
            "token": $.Consent.refreshToken,
            "client_id": $.CheckAndUpdateClientRegistration.clientId,
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, $.DataHolderOidc.introspection_endpoint, $.DataRecipientJwks),
        })
    }

    let response:AxiosResponse<{active:boolean}> = await axios.request(cert.inject(options));
  
    if (!response.data.active) {
        await consentManager.RevokeConsent($.Consent,"DataHolder");
        return {
            active: false
        }        
    } else {
        return {
            active: true
        }        
    }

}

export const FetchTokens = async (logger: winston.Logger, cert: ClientCertificateInjector, $: {
    Consent: Types.ConsentRequestLog,
    AuthCode?: string,
    DataRecipientJwks: Types.JWKS.KeyStore,
    DataHolderOidc: Types.DataholderOidcResponse,
    CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {
    let additionalParams = <any>{}

    const grantParams: Types.TokenGrantParams = $.AuthCode ? { grant_type: "authorization_code", code: $.AuthCode } : { grant_type: "refresh_token" };

    if (grantParams.grant_type == 'refresh_token') {
        additionalParams["refresh_token"] = $.Consent.refreshToken
    }

    if (grantParams.grant_type == 'authorization_code') {
        additionalParams["redirect_uri"] = $.Consent.redirectUri
    }

    let options: AxiosRequestConfig = {
        method: 'POST',
        url: $.DataHolderOidc.token_endpoint,
        responseType: "json",
        data: qs.stringify(_.merge(grantParams, {
            "client_id": $.CheckAndUpdateClientRegistration.clientId,
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": CreateAssertion($.CheckAndUpdateClientRegistration.clientId, $.DataHolderOidc.token_endpoint, $.DataRecipientJwks),
        }, additionalParams))
    }

    cert.inject(options);
    const tokenRequestTime = moment.utc().toDate();

    let response = await axios.request(options);

    let responseObject: Types.TokenResponse = response.data;

    // Log the response so that manual recover can occur in the case or exceptions before/during persisting new tokens
    logger.info({
        consentId: $.Consent.id,
        existingAuth: additionalParams,
        tokenResponse: responseObject
    })

    return {
        tokenResponse: responseObject,
        tokenRequestTime
    }

}