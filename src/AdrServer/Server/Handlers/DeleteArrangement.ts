import _ from "lodash";
import express, { urlencoded } from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, body } from 'express-validator'
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../../Common/Entities/ConsentRequestLog";
import moment from "moment";
import { GatewayRequest } from "../../../Common/Server/Types";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { JWKS, JWT, JWS } from "jose";
import { JoseBindingConfig } from "../../../Common/Server/Config";
import urljoin from "url-join";

interface ClientJWTPayload {
    iss: string;
    sub: string;
    aud: string;
    jti?: string;
    exp?: string;
    iat?: string;
    nbf?: string;
}

@injectable()
export class DeleteArrangementMiddleware {
    constructor(
        @inject("Logger") private logger: winston.Logger,
        private consentManager: ConsentRequestLogManager,
        private connector: DefaultConnector,
        @inject("JoseBindingConfig") private configFn: () => Promise<JoseBindingConfig>
    ) { }

    handler = () => {
        let validationErrorMiddleware = (req: express.Request, res: express.Response, next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: "invalid_request", errors: errors.array() });
            }
            next();
        }

        let RevocationResponder = async (req: express.Request, res: express.Response, next: NextFunction) => {

            let m: {
                cdr_arrangement_jwt: string
            } = <any>matchedData(req);

            console.log("Delete arrangement call", m.cdr_arrangement_jwt)

            // verify the cdr_arrangement_jwt 
            let authHeader = req.headers['authorization']
            if (typeof authHeader == 'undefined') throw new Error("Authorization header is not present");
            if (!authHeader.startsWith("Bearer ")) throw new Error("Bearer token expected but not supplied");

            let bearerTokenJwt: string = authHeader.substr("Bearer ".length);
            let authPayload = <ClientJWTPayload>JWT.decode(bearerTokenJwt);
            let assumedClientId = authPayload?.sub
            if (typeof assumedClientId !== 'string') throw new Error("JWT sub claim is not a string");
            let jwks = await this.connector.DataHolderRevocationJwks(assumedClientId).GetWithHealing({
                validator: (jwks) => {
                    JWS.verify(bearerTokenJwt, jwks);
                    return true;
                }
            });

            let verified = <object | undefined>undefined;

            // verify cdr_arrangement_jwt
            verified = JWT.verify(m.cdr_arrangement_jwt, jwks, {
                complete: false,    // set as false since we may not get all the jwt claims from this
                algorithms: ["PS256", "ES256"]
            });

            // further checks aside from jose processing
            if (typeof verified == 'undefined') throw 'Verified JWT payload expected, but is undefined'

            // decode the cdr_arrangement_id from the cdr_arrangement_jwt
            let bodyPayload: {
                cdr_arrangement_id?: string,
            } = JWT.decode(m.cdr_arrangement_jwt)

            // this is end

            let verifiedClientId = (req as GatewayRequest)?.gatewayContext?.verifiedBearerJwtClientId

            this.logger.debug({
                message: "Received arrangement revocation request",
                meta: { token: bodyPayload.cdr_arrangement_id, verifiedClientId },
                date: moment().toISOString()
            });

            try {

                let consentManager = this.consentManager;
                let consents: ConsentRequestLog[] = await consentManager.GetConsentsByDeleteArrangementParams(bodyPayload.cdr_arrangement_id, verifiedClientId);

                // only revoke current consents
                consents = consents.filter(c => c.IsCurrent());

                if (consents.length < 1) {
                    return res.sendStatus(422);
                }

                for (let consent of consents) {
                    await consentManager.RevokeConsent(consent, "DataHolder");
                    this.logger.info({
                        message: "Revoked consent",
                        correlationId: (<any>req).correlationId,
                        meta: { cdr_arrangement_id: bodyPayload.cdr_arrangement_id },
                        date: moment().toISOString()
                    });

                }

                return res.sendStatus(204);

            } catch (e) {
                this.logger.error({
                    message: "Failed token revocation request",
                    correlationId: (<any>req).correlationId,
                    meta: { token: m.cdr_arrangement_jwt },
                    error: e,
                    date: moment().toISOString()
                });
            }


        };

        return [
            urlencoded({ extended: true }),
            body('cdr_arrangement_jwt').isString(),
            validationErrorMiddleware,
            RevocationResponder
        ];
    }
} 