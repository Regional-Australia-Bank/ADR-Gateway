import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { check, validationResult, query, ValidationChain, body, matchedData } from 'express-validator'
import { injectable, inject } from "tsyringe";
import winston from "winston";
import bodyParser, { urlencoded } from "body-parser";
import { ConsentRequestLogManager } from "../../../Common/Entities/ConsentRequestLog";
import { AdrServerConfig } from "../Config";
import moment from "moment";
import { GatewayRequest } from "../../../Common/Server/Types";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";

@injectable()
class RevokeMiddleware {
    constructor(
        @inject("Logger") private logger: winston.Logger,
        private consentManager: ConsentRequestLogManager,
        private connector: DefaultConnector,
        @inject("AdrServerConfig") private config: AdrServerConfig
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
                            "code": "urn:au-cds:error:cds-banking:RevokeToken/RequestValidation",
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
                token: string
            } = <any>matchedData(req);

            let verifiedClientId = (req as GatewayRequest)?.gatewayContext?.verifiedBearerJwtClientId

            this.logger.debug({
                message: "Received token revocation request",
                meta: { token: m.token, verifiedClientId },
                date: moment().toISOString()
            });

            try {
                if (typeof m.token == 'undefined') {
                    res.statusCode = 400;
                    res.json({
                        errors: [
                            {
                                "code": "urn:au-cds:error:cds-banking:RevokeToken/RequestValidation",
                                "title": "Invalid request",
                                "detail": "Request does not contain the necessary fields"
                            }
                        ]
                    })
                    return;
                }

                let consentManager = this.consentManager;
                let isAccessToken = await consentManager.IsAccessToken(m.token, verifiedClientId);
                if (isAccessToken || ((typeof req.body.token_type_hint != 'undefined') && (req.body.token_type_hint != "refresh_token"))) {
                    res.statusCode = 400;
                    res.json({
                        errors: [
                            {
                                "code": "urn:au-cds:error:cds-banking:RevokeToken/UnsupportedTokenType",
                                "title": "Unsupported token type",
                                "detail": "Revoke token supplied is not a supported token type"
                            }
                        ]
                    })
                    return;
                }

                await consentManager.RevokeByRefreshToken(m.token, verifiedClientId);
                this.logger.info({
                    message: "Revoked token",
                    correlationId: (<any>req).correlationId,
                    meta: { token: m.token },
                    date: moment().toISOString()
                });

                res.sendStatus(200);

            } catch (e) {
                this.logger.error({
                    message: "Failed token revocation request",
                    correlationId: (<any>req).correlationId,
                    meta: { token: m.token },
                    error: e,
                    date: moment().toISOString()
                });
                res.statusCode = 500;
                res.json({
                    errors: [
                        {
                            "code": "urn:au-cds:error:cds-banking:RevokeToken/Unexpected",
                            "title": "Failed token revocation",
                            "detail": "Unexpected error, unable to revoke token"
                        }
                    ]
                })
            }


        };

        return [
            urlencoded({ extended: true }),
            body('token').isString(),
            body('token_type').isString().equals("refresh_token").optional(),

            validationErrorMiddleware,
            RevocationResponder
        ];
    }
}

export { RevokeMiddleware }