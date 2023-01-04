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
export class DeleteArrangementMiddleware_new {
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
                this.logger.error({
                    message: "Failed request validation",
                    error: errors.array(),
                    date: moment().toISOString()
                })
                return res.status(400).json({
                    errors: [
                        {
                            "code": "urn:au-cds:error:cds-banking:DeleteArrangement/RequestValidation",
                            "title": "Invalid request",
                            "detail": "Request does not contain the necessary fields"
                        }
                    ]
                });
            }
            next();
        }

        let RevocationResponder = async (req: express.Request, res: express.Response, next: NextFunction) => {

            let m: {
                cdr_arrangement_jwt: string,
                cdr_arrangement_id: string | undefined,
            } = <any>matchedData(req);

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
            let config = await this.configFn()
            let requestedUri: string;
            let applicationBase: string = config.SecurityProfile.JoseApplicationBaseUrl;
            try {
                if (typeof applicationBase == 'undefined') throw new Error("JoseApplicationBaseUrl is not configured");
                if (typeof req?.route?.path == 'undefined') throw new Error("Request cannot be parsed")

                if (config.SecurityProfile.AudienceRewriteRules && config.SecurityProfile.AudienceRewriteRules[req.path]) {
                    requestedUri = urljoin(applicationBase, config.SecurityProfile.AudienceRewriteRules[req.path]);
                } else {
                    requestedUri = urljoin(applicationBase, req.path);
                }
            }
            catch (err) {
                throw new Error("Request uri cannot be parsed")
            }
            
            // Commented out and use the compelte false just in case we dont get all the fields

            // let verified = <JWT.completeResult | undefined>undefined;
            // verified = JWT.verify(m.cdr_arrangement_jwt, jwks, {
            //     complete: true,
            //     audience: [requestedUri, applicationBase],
            //     issuer: assumedClientId,
            //     subject: assumedClientId,
            //     algorithms: ["PS256", "ES256"]
            // });
            let verified = <object | undefined>undefined;
           
            verified = JWT.verify(m.cdr_arrangement_jwt, jwks, {
                complete: false,
                algorithms: ["PS256", "ES256"]
            });

            // further checks aside from jose processing
            if (typeof verified == 'undefined') throw 'Verified JWT payload expected, but is undefined'

            // decode the 
            let bodyPayload: {
                cdr_arrangement_id?: string,
            } = JWT.decode(m.cdr_arrangement_jwt)

            // if cdr_arrangement_id exist from the body we need to validate it
            if(m.cdr_arrangement_id){
                if(m.cdr_arrangement_id !== bodyPayload.cdr_arrangement_id) {
                    return res.status(400).json({
                        errors: [
                            {
                                "code": "urn:au-cds:error:cds-banking:DeleteArrangement/NotMatched",
                                "title": "cdr_arrangement_id not matched",
                                "detail": `cdr_arrangement_id from the body does not match the cdr_arrangement_id from the jwt`
                            }
                        ]
                    });
                }
            }

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
                    return res.status(422).json({
                        errors: [
                            {
                                "code": "urn:au-cds:error:cds-banking:DeleteArrangement/NotFound",
                                "title": "Consent not found",
                                "detail": `Unable to find consent with the following arrangement id: ${bodyPayload.cdr_arrangement_id}`
                            }
                        ]
                    });
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
                res.statusCode = 500;
                res.json({
                    errors: [
                        {
                            "code": "urn:au-cds:error:cds-banking:DeleteArrangement/Unexpected",
                            "title": "Failed to revoked consent",
                            "detail": `Unexpected error, unable to revoke consent for arrangement id: ${m.cdr_arrangement_jwt}`
                        }
                    ]
                })
            }


        };

        return [
            urlencoded({ extended: true }),
            body('cdr_arrangement_jwt').isString(),
            body('cdr_arrangement_id').isString().optional(),
            validationErrorMiddleware,
            RevocationResponder
        ];
    }
} 
