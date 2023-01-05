import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, check, body } from 'express-validator'
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { JWT, JWKS, JSONWebKeySet } from "jose";
import bodyParser from "body-parser";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import moment from "moment";
import { OIDCConfiguration, DhServerConfig } from "../Config";
import { ConsentManager, Consent } from "../../Entities/Consent";
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { axios } from "../../../../Common/Axios/axios";
import { ClientCertificateInjector } from "../../../../Common/Services/ClientCertificateInjection";

@injectable()
export class TokenIntrospectionMiddleware {
    constructor(
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("ClientCertificateInjector") private mtls: ClientCertificateInjector,
        private consentManager: ConsentManager,
    ) { }


    handler = () => {
        let validationErrorMiddleware = (req: express.Request, res: express.Response, next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: "invalid_request" });
            }
            next();
        }

        let Responder = async (req: express.Request, res: express.Response, next: NextFunction) => {

            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('Pragma', 'no-cache')

            let params: {
                client_assertion: string
                token: string
                client_id: string
            } = <any>matchedData(req)

            // TODO move this client credntial check to an auth middleware
            let client = await this.clientRegistrationManager.GetRegistration(params.client_id);

            if (typeof client == 'undefined') return res.status(401).json({ error: "invalid_client" });

            // GET the JWKS for signing
            let client_jwks = JWKS.asKeyStore(await (await axios.get(client.jwks_uri, this.mtls.injectCa({ responseType: "json" }))).data)

            // verify the JWT
            let payload: any;
            try {
                payload = JWT.verify(params.client_assertion, client_jwks, { algorithms: ["PS256"] })
                for (let key of ['aud', 'jti', 'exp', 'iss', 'sub'])
                    if (typeof payload[key] === 'undefined') {
                        throw `key ${key} is missing from JWT`
                    }
            } catch (e) {
                return res.status(401).json({ error: "invalid_client" })
            }

            let consent: Consent | undefined;
            consent = await this.consentManager.getConsentByRefreshToken({ client_id: params.client_id, refresh_token: params.token });

            try {
                Consent.AssertValidAndCurrent(consent)
                let responseBody = {
                    active: true,
                    exp: consent!.refreshTokenExpiresNumericDate(),
                    cdr_arrangement_id: consent!.cdr_arrangement_id
                }
                return res.json(responseBody)
            } catch (e) {
                return res.json({ active: false })
            }


        };

        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
            bodyParser.urlencoded({ extended: true }),
            check("token_type_hint").isIn(['refresh_token']).withMessage("grant_type must be refresh_token or authorization_code").optional().bail(),
            body('token').isString(),
            check("client_id").isString(),
            body('client_assertion_type').isString().equals("urn:ietf:params:oauth:client-assertion-type:jwt-bearer").withMessage("invalid client_assertion_type"),
            check("client_assertion").isJWT()
        ], [
            <any>validationErrorMiddleware,
            Responder
        ])
    }

}
