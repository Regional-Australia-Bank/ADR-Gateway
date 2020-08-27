import { param } from "express-validator";
import { stringify } from "querystring";
import { ConsentRequestLog, ConsentRequestLogManager } from "../../../Common/Entities/ConsentRequestLog";

import { TestContext } from "../Framework/TestContext";
import { getAuthPostGetRequestUrl } from "../../../AdrGateway/Server/Helpers/HybridAuthJWS";
import uuid from "uuid";
import moment from "moment";
import puppeteer, { Browser, ElementHandle } from "puppeteer"
import { TestDhConsentConfirmer } from "./TestDhDataholderConsentConfirmer";
import { ConsentConfirmer, OAuthHybridFlowResult } from "./ConsentConfirmer";
import { axios } from "../../../Common/Axios/axios";
import { NewConsentParams } from "../NewGatewayConsent";
import { AdrGatewayConfig } from "../../../AdrGateway/Config";
import { GenerateTestData } from "../Framework/TestData";
import { logger } from "../../Logger";


class TestConsentRequestor {
    private consentManager:ConsentRequestLogManager;

    constructor(
        private testContext:TestContext
    ){
        this.consentManager = testContext.environment.TestServices.adrGateway?.connectivity.consentManager
    }

    GetMatchingCurrentConsent = async (params: {
        dataholderBrandId: string
        cdrScopes: string[],
        userId: string,
        systemId: string,
        sharingDuration: number
    }):Promise<ConsentRequestLog> => {
        const connection = await this.testContext.environment.TestServices.adrDbConn;
        if (!connection) throw 'No connection'
        const consents = await connection.manager.find(ConsentRequestLog,{
            where: {
                dataHolderId: params.dataholderBrandId,
                adrSystemUserId: params.userId,
                adrSystemId: params.systemId,
                requestedSharingDuration: params.sharingDuration
            },
            order: {
                accessTokenExpiry: "DESC" // increase the chances we get a current access token
            }
        });

        // if a matching consent is current and has all the required scopes, return it (even the first one!)
        for (let consent of consents) {
            if (!consent.IsCurrent()) continue;

            let hasScopes = true;
            for (let scope of params.cdrScopes) {
                if (!consent.HasScope(scope)) {
                    hasScopes = false;
                    break;
                }
            }
            if (hasScopes) return consent;
        }

        // otherwise, get a matching scope
        let res = await this.GetNewConsent(params);
        if (!res.consent) throw 'Could not GetNewConsent'
        return res.consent
    }

    GetMatchingCurrentConsentWithCurrentAccessToken = async (params: {
        dataholderBrandId: string
        cdrScopes: string[],
        userId: string,
        systemId: string,
        sharingDuration: number
    }):Promise<ConsentRequestLog> => {
        let config = await this.testContext.AdrGatewayConfig()

        const consent = await this.GetMatchingCurrentConsent(params);
        if (!consent.HasCurrentAccessToken()) {
            if (consent.HasCurrentRefreshToken()) {
                // Call userInfo through AdrGateway which will refresh tokens

                let userInfoResult = await axios.request(this.testContext.environment.Util.TlsAgent({
                    method:"GET",
                    url: `${config.adrGateway.path}/cdr/consents/${consent.id}/userInfo`,
                    responseType: "json",
                }));

                // return the updated consent
                return await this.consentManager.GetConsent(consent.id);

            } else {
                throw `Current consent does not have a refresh token`
            }
        } else {
            return consent;
        }
    }

    RefreshAccessToken = async (consent:ConsentRequestLog):Promise<ConsentRequestLog> => {
        let config = await this.testContext.AdrGatewayConfig()

        if (consent.HasCurrentRefreshToken()) {
            // Hack to force a refresh on accessing the user info endpoint
            consent.accessTokenExpiry = moment().utc().subtract(1,'day').toDate();
            await consent.save();
            // let connection = (await this.consentManager.connection);
            // await connection.manager.save(consent);
            // Call userInfo through AdrGateway which will refresh tokens
            let userInfoResult = await axios.request(this.testContext.environment.Util.TlsAgent({
                method:"GET",
                url: `${config.adrGateway.path}/cdr/consents/${consent.id}/userInfo`,
                responseType: "json",
            }));

            // return the updated consent
            return await this.consentManager.GetConsent(consent.id);

        } else {
            throw `Current consent does not have a refresh token`
        }
    }

    GetNewConsentRequestUrlAndId = async (params: {
        dataholderBrandId: string
        cdrScopes: string[],
        userId: string,
        systemId: string,
        sharingDuration: number
        additionalClaims?: AdrGatewayConfig["DefaultClaims"]
    }):Promise<{redirectUrl:string,consentId:number}> => {
        let config = await this.testContext.AdrGatewayConfig()

        const res = await axios.request(this.testContext.environment.Util.TlsAgent({
            method: "POST",
            url: `${config.adrGateway.path}/cdr/consents`,
            responseType:"json",
            data: {
                userId: params.userId,
                productKey: "sandbox",
                systemId: params.systemId,
                scopes: params.cdrScopes,
                sharingDuration: params.sharingDuration,
                state: `${params.systemId}:${params.userId}`,
                additionalClaims: params.additionalClaims,
                softwareProductId: await this.testContext.environment.OnlySoftwareProduct(),
                dataholderBrandId: params.dataholderBrandId
            },
        }));

        return <{redirectUrl:string,consentId:number}>res.data;
    }

    GetTestingNewConsentRequestUrl = async (params: {
        dataholderBrandId: string
        cdrScopes: string[],
        userId: string,
        systemId: string,
        sharingDuration: number
    }):Promise<string> => {
        return await getAuthPostGetRequestUrl({
            clientId: await (await this.testContext.TestData()).dataRecipient.clientId(),
            callbackUrl: await (await this.testContext.TestData()).dataRecipient.authCallbackUri(),
            sharingDuration: params.sharingDuration || 0,
            authorizeEndpointUrl: (await this.testContext.TestData()).dataHolder.authorizeEndpoint,
            scopes: params.cdrScopes,
            adrSigningJwk: (await (await this.testContext.TestData()).dataRecipient.jwks()).get({use:'sig'}),
            nonce: uuid.v4(),
            state: params.systemId+":"+params.userId,
            issuer: (await this.testContext.TestData()).dataHolder.issuer
        });
    }

    GetNewConsent = async (params: NewConsentParams):Promise<{
        consent?:ConsentRequestLog,
        oAuthResult: OAuthHybridFlowResult
    }> => {

        let consentRequestUrlAndId:{redirectUrl: string, consentId: number} = await this.GetNewConsentRequestUrlAndId(params);

        const authparams = {
            consentId: consentRequestUrlAndId.consentId,
            redirectUrl: consentRequestUrlAndId.redirectUrl,
            context: this.testContext
        };

        if (params.urlFilter) {
            authparams.redirectUrl = params.urlFilter(authparams.redirectUrl)
        }

        const adrConsentId:number = authparams.consentId;
        let cc:ConsentConfirmer;

        // Open the redirect URL
        logger.debug(authparams);
        cc = new TestDhConsentConfirmer();

        // Wait for the consent to be finalised
        const consentPromise = new Promise<{
            consent?:ConsentRequestLog,
            oAuthResult: OAuthHybridFlowResult
        }>((resolve,reject) => {
    
            let oAuthResultPromise = cc.Confirm(authparams);
            return oAuthResultPromise.then(async (res) => {
                if (!res?.hash?.error && !res.unredirectableError) {
                    let consent:ConsentRequestLog = await this.consentManager.GetConsent(adrConsentId); 
                    return {
                        oAuthResult: res,
                        consent
                    }                   
                } else {
                    return {
                        oAuthResult: res
                    }
                }
            }).then(resolve,reject)          

        });

        let cleanup = consentPromise.finally(async () => {
            try {
                await cc.CleanUp();
            } catch (e) {
                logger.error(e)
            }
        });
   
        let cleanupResult = await cleanup;
        return cleanupResult;
    }
}

export {TestConsentRequestor}