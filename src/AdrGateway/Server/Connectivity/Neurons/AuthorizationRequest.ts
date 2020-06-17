import { Neuron } from "../../../../Common/Connectivity/Neuron"
import { DataHolderRegistration } from "../../../Entities/DataHolderRegistration"
import { DataholderOidcResponse } from "./DataholderRegistration"
import { AdrConnectivityConfig, AdrGatewayConfig, SoftwareProductConnectivityConfig } from "../../../Config"
import { JWKS } from "jose"
import uuid = require("uuid")
import _ from "lodash"
import { getAuthPostGetRequestUrl } from "../../Helpers/HybridAuthJWS"
import { ConsentRequestLogManager } from "../../../Entities/ConsentRequestLog"

export interface ConsentRequestParams {
    sharingDuration: number,
    state: string,
    systemId: string,
    userId: string,
    scopes: string[],
    dataholderBrandId: string,
    productKey: string,
    additionalClaims?: AdrGatewayConfig["DefaultClaims"]
}

// const AuthorizationRequestNeuron = () => {

export class AuthorizationRequestNeuron extends Neuron<[
    DataHolderRegistration,
    DataholderOidcResponse,
    AdrConnectivityConfig,
    SoftwareProductConnectivityConfig,
    JWKS.KeyStore,
    ConsentRequestParams
],{
    redirectUrl: string,
    consentId:number
}> {

    constructor(
        private consentManager:ConsentRequestLogManager
    ) {super()}

    evaluator = async ([
        dhRegistration,
        dhOidc,
        config,
        productConfig,
        jwks,
        p
    ]: [
        DataHolderRegistration,
        DataholderOidcResponse,
        AdrConnectivityConfig,
        SoftwareProductConnectivityConfig,
        JWKS.KeyStore,
        ConsentRequestParams
    ]) => {

        // populate the the OAuth2 hybrid flow request params (userId: string, scopes: string[])

        const stateParams = {
            nonce: uuid.v4(),
            state: p.state || uuid.v4()
        }

        // ensure the openin scope is included
        const requestedScopes = _.uniqBy(_.union(["openid"],p.scopes),e=>e);

        let additionalClaims = {
            userinfo: _.merge(config.DefaultClaims?.userinfo, p.additionalClaims?.userinfo),
            id_token: _.merge(config.DefaultClaims?.id_token, p.additionalClaims?.id_token)
        }

        let redirectUri = productConfig.redirect_uris[0];

        // sign with JWT
        let authUrl = getAuthPostGetRequestUrl({
            clientId: dhRegistration.clientId,
            callbackUrl: redirectUri,
            sharingDuration: p.sharingDuration || 0,
            issuer: dhOidc.issuer,
            authorizeEndpointUrl: dhOidc.authorization_endpoint,
            scopes: requestedScopes,
            adrSigningJwk: jwks.get({use:'sig',alg:"PS256"}),
            nonce: stateParams.nonce,
            state: stateParams.state,
            additionalClaims
        });

        // log to the DB
        let logManager = this.consentManager;
        let newConsent = await logManager.LogAuthRequest({
            adrSystemId: p.systemId,
            adrSystemUserId: p.userId,
            dataHolderId: p.dataholderBrandId,
            productKey: p.productKey,
            softwareProductId: productConfig.ProductId,
            requestedSharingDuration: p.sharingDuration || 0,
            nonce: stateParams.nonce,
            state: stateParams.state,
            scopes: requestedScopes,
            redirectUri
        });

        // return the redirect URI to the caller

        return {redirectUrl: authUrl, consentId:newConsent.id, softwareProductId: newConsent.softwareProductId};

        // Must also log the request
    }

}
