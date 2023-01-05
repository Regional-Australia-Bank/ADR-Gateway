import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, body, param } from 'express-validator'
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { JWT, JWKS } from "jose";
import bodyParser from "body-parser";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import { ConsentManager } from "../../Entities/Consent";
import { axios } from "../../../../Common/Axios/axios";
import { ClientCertificateInjector } from "../../../../Common/Services/ClientCertificateInjection";

@injectable()
export class DeleteArrangementMiddleware {
    constructor(
        @inject("Logger") private logger: winston.Logger,
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
                cdr_arrangement_id: string     // cdr_arrangement_jwt: string
                client_id: string
            } = <any>matchedData(req)

            // TODO move this client credntial check to an auth middleware
            let client = await this.clientRegistrationManager.GetRegistration(params.client_id);

            if (typeof client == 'undefined') return res.status(401).json({ error: "invalid_client" });

            // GET the JWKS for signing  

            // NOTE: comment out because of the cdr_arrangement_id is being use here instead of cdr_arrangement_jwt

            // let client_jwks = JWKS.asKeyStore(await (await axios.get(client.jwks_uri, this.mtls.injectCa({ responseType: "json" }))).data)

            // // verify the JWT
            // let payload: any;
            // try {
            //     payload = JWT.verify(params.client_assertion, client_jwks, { algorithms: ["PS256"] })
            //     for (let key of ['aud', 'jti', 'exp', 'iss', 'sub'])
            //         if (typeof payload[key] === 'undefined') {
            //             throw `key ${key} is missing from JWT`
            //         }
            // } catch (e) {
            //     return res.status(401).json({ error: "invalid_client" })
            // }
            // this.logger.info("Revoked arrangement cdr_arrangement_jwt:  " + params.cdr_arrangement_jwt);

            // let cdr_arrangement_object: any;
            // try {
            //     cdr_arrangement_object = JWT.verify(params.cdr_arrangement_jwt, client_jwks, { algorithms: ["PS256"] })
            //     if (typeof cdr_arrangement_object.cdr_arrangement_id === 'undefined') {
            //         throw `cdr_arrangement_id is missing from cdr_arrangement_jwt`
            //     }
            // } catch (e) {
            //     return res.status(401).json({ error: "invalid cdr_arrangement_jwt" })
            // }

            

            // if (typeof cdr_arrangement_object.cdr_arrangement_id !== 'string') {
            //     res.statusCode = 400;
            //     res.json({ error: "invalid_request" })
            //     return;
            // }

            let dataRecipientId = <string>req.body.client_id;

            await this.consentManager.revokeArrangement(params.cdr_arrangement_id, dataRecipientId);

            this.logger.info("Revoked arrangement: " + params.cdr_arrangement_id);

            res.sendStatus(204);

        };

        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
            bodyParser.urlencoded({ extended: true }),
            body('cdr_arrangement_id').isString(),
            body("client_id").isString(),
            body('client_assertion_type').isString().equals("urn:ietf:params:oauth:client-assertion-type:jwt-bearer").withMessage("invalid client_assertion_type"),
            body("client_assertion").isJWT()
        ], [
            <any>validationErrorMiddleware,
            Responder
        ])
    }

}
