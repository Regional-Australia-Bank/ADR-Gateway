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
export class ConsentRevocationPropagationNeuron extends Neuron<[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration],ConsentRequestLog> {
    constructor(
        private cert:ClientCertificateInjector,
        private consent: ConsentRequestLog,
        private pw: DefaultPathways,
        private consentManager: ConsentRequestLogManager,
    ) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([drJwks,dhoidc,registration]:[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration]) => {

        if (!this.consent.refreshToken) throw 'ConsentRevocation: consent has no refreshToken';
        
        let options:AxiosRequestConfig = {
            method:'POST',
            url: dhoidc.revocation_endpoint,
            responseType: "json",
            data: qs.stringify({
                "token_type_hint":"refresh_token",
                "token":this.consent.refreshToken,
                "client_id":registration.clientId,
                "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": CreateAssertion(registration.clientId,dhoidc.token_endpoint,drJwks),
            })
        }
    
        this.cert.inject(options);
        const tokenRequestTime = moment.utc().toDate();
        let response = await axios.request(options);
    
        let responseObject:TokenResponse = response.data;

        if (response.status !== 200) throw 'Revocation was not successful'

        this.pw.logger.info({
            date: moment().toISOString(),
            consentRevoked: this.consent
        })

        let updatedConsent = await this.consentManager.MarkRevoked(this.consent);
        return this.consent;

    }
}
