import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { JWKS } from "jose";
import { DataholderOidcResponse } from "./DataholderRegistration";
import { DataHolderRegistration } from "../../../Entities/DataHolderRegistration";
import { ConsentRequestLog, ConsentRequestLogManager } from "../../../Entities/ConsentRequestLog";
import { CreateAssertion } from "../Assertions";
import { DataholderOidcMetadata } from "../../../Services/DataholderMetadata";
import { AxiosRequestConfig } from "axios"
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import moment from "moment";
import { DefaultPathways } from "../Pathways";
import _ from "lodash"
import { injectable, inject } from "tsyringe";
import { TokenRequestParams, TokenResponse } from "./ConsentAccessToken";
import qs from "qs";
import { axios } from "../../../../Common/Axios/axios";
import winston from "winston";


@injectable()
export class ConsentRefreshTokenNeuron extends Neuron<[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration],ConsentRequestLog> {
    constructor(
        private cert:ClientCertificateInjector,
        private consent: ConsentRequestLog,
        private params:TokenRequestParams,
        private pw: DefaultPathways,
        private consentManager: ConsentRequestLogManager,
    ) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([drJwks,dhoidc,registration]:[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration]) => {

        let additionalParams = <any>{}

        if (this.params.grant_type == 'refresh_token') {
            additionalParams["refresh_token"] = this.consent.refreshToken
        }

        if (this.params.grant_type == 'authorization_code') {
            additionalParams["redirect_uri"] = this.consent.redirectUri
        }

        let options:AxiosRequestConfig = {
            method:'POST',
            url: dhoidc.token_endpoint,
            responseType: "json",
            data: qs.stringify(_.merge(this.params,{
                "client_id":registration.clientId,
                "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": CreateAssertion(registration.clientId,dhoidc.token_endpoint,drJwks),
            },additionalParams))
        }
    
        this.cert.inject(options);
        const tokenRequestTime = moment.utc().toDate();
        let response = await axios.request(options);
    
        let responseObject:TokenResponse = response.data;

        // Log the response so that manual recover can occur in the case or exceptions before/during persisting new tokens
        this.pw.logger.info({
            consentId: this.consent.id,
            existingAuth: additionalParams,
            tokenResponse: responseObject
        })
        
        let newClaims:{refresh_token_expires_at:number,sharing_expires_at?:number};
        let idToken:{refresh_token_expires_at:number,sharing_expires_at?:number}|undefined = undefined;
    
        // id_token can only be relied upon to be supplied if grant_type == 'authorization_code'
        if (this.params.grant_type == 'authorization_code' || typeof responseObject.id_token == 'string') {
            newClaims = await this.pw.ValidIdTokenCode(registration.softwareProductId,registration.dataholderBrandId,responseObject.id_token).GetWithHealing() // Move to Pathways.ts
            idToken = newClaims;
        } else {
            // otherwise, we need to get claims from user_info endpoint
            try {
                newClaims = await this.pw.ConsentUserInfo(this.consent,{accessToken:responseObject.access_token}).GetWithHealing() // Move to Pathways.ts
            } catch (e) {
                // if for some reason the user_info endpoint is not available, save the new tokens. Assume a 28 day (minus a bit) refresh token expiry
                newClaims = {
                    refresh_token_expires_at: moment.utc().add(27,'days').unix(),
                    sharing_expires_at: undefined
                }                
            }
            // newClaims = await GetUserInfo(dataholder,responseObject.access_token,this.clientCertInjector);
        }
    
        let updatedConsent = await this.consentManager.UpdateTokens(
            this.consent.id,
            _.pick(responseObject,['access_token','token_type','expires_in','refresh_token','scope']),
            tokenRequestTime,
            newClaims.sharing_expires_at,
            newClaims.refresh_token_expires_at,
            idToken && JSON.stringify(idToken));
        return updatedConsent;

    }
}
