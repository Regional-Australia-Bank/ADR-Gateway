import { TestAction, TestActionResult } from "./Framework/TestActions";
import request = require("request");
import { response } from "express";
import { ConsentRequestLog, ConsentRequestLogManager } from "../../AdrGateway/Entities/ConsentRequestLog";
import { TestConsentRequestor } from "./Helpers/TestConsentRequestor";
import { OAuthHybridFlowResult } from "./Helpers/ConsentConfirmer";
import { AdrGatewayConfig } from "../../AdrGateway/Config";

interface NewConsentResult extends TestActionResult {
    consent?: ConsentRequestLog;
    oAuthResult: OAuthHybridFlowResult
}

interface ConsentResult extends TestActionResult {
    consent?: ConsentRequestLog;
}


export interface NewConsentParams {
    dataholderBrandId: string
    cdrScopes: string[],
    userId: string,
    systemId: string,
    sharingDuration: number,
    additionalClaims?: AdrGatewayConfig["DefaultClaims"]
    urlFilter?: (u:string) => string
}

class NewGatewayConsent extends TestAction<NewConsentResult> {
    Perform = async (): Promise<NewConsentResult> => {
        let requestor = new TestConsentRequestor(
            this.testContext
        );
        let result = await requestor.GetNewConsent(await this.parameters);
        return Promise.resolve(result)
    }
    parameters!: NewConsentParams
}

class ExistingCurrentGatewayConsent extends TestAction<ConsentResult> {
    Perform = async (): Promise<ConsentResult> => {
        let requestor = new TestConsentRequestor(
            this.testContext
        );
        return {consent: await requestor.GetMatchingCurrentConsent(await this.parameters)}
    }
    parameters!: {
        dataholderBrandId: string
        cdrScopes: string[],
        userId: string,
        systemId: string,
        sharingDuration: number
    }
}

class GatewayConsentWithCurrentAccessToken extends ExistingCurrentGatewayConsent {
    Perform = async (): Promise<ConsentResult> => {
        let requestor = new TestConsentRequestor(
            this.testContext
        );
        return {consent: await requestor.GetMatchingCurrentConsentWithCurrentAccessToken(await this.parameters)}
    }
}

class RefreshAccessTokenForConsent extends TestAction<ConsentResult> {
    Perform = async (): Promise<ConsentResult> => {
        let requestor = new TestConsentRequestor(
            this.testContext
        );
        return {consent: await requestor.RefreshAccessToken(await this.parameters)}
    }
    parameters!: Promise<ConsentRequestLog>
}

export {NewGatewayConsent,ExistingCurrentGatewayConsent,GatewayConsentWithCurrentAccessToken,RefreshAccessTokenForConsent}