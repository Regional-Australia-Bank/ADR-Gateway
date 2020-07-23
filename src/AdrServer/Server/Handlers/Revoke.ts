import * as _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import {check, validationResult, query, ValidationChain, body, matchedData} from 'express-validator'
import { injectable, inject } from "tsyringe";
import winston from "winston";
import bodyParser, { urlencoded } from "body-parser";
import { ConsentRequestLogManager } from "../../../AdrGateway/Entities/ConsentRequestLog";
import { AdrServerConfig } from "../Config";
import moment from "moment";
import { GatewayRequest } from "../../../Common/Server/Types";
import { DefaultConnector } from "../../../AdrGateway/Server/Connectivity/Connector.generated";

// TODO remove some repetition. Similar to DhServer\Server\Handlers\ClientAccesstoken.ts and AdrServer\Server\Handlers\Revocation.ts
@injectable()
class RevokeMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentRequestLogManager,
        private connector:DefaultConnector,
        @inject("AdrServerConfig") private config:AdrServerConfig
    ){}
    
    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
            return res.status(400).json({ error:"invalid_request", errors: errors.array() });
            }
            next();
        }

        let RevocationResponder = async (req:express.Request,res:express.Response,next: NextFunction) => {

            // TODO create and ID Token and return it in the response

            let m:{
                token: string
            } = <any>matchedData(req);

            let verifiedClientId = (req as GatewayRequest)?.gatewayContext?.verifiedBearerJwtClientId

            this.logger.debug({
                message: "Received token revocation request",
                meta: {token: m.token, verifiedClientId},
                date: moment().toISOString()
            });

            try {
                if (typeof m.token == 'undefined' ) {
                    res.statusCode = 400;
                    res.json({error:"invalid_request"})
                    return;
                }
    
                let consentManager = this.consentManager;
                let isAccessToken = await consentManager.IsAccessToken(m.token,verifiedClientId);
                if (isAccessToken || ((typeof req.body.token_type_hint != 'undefined') && (req.body.token_type_hint != "refresh_token"))) {
                    res.statusCode = 400;
                    res.json({error:"unsupported_token_type"})
                    return;
                }
            
                await consentManager.RevokeByRefreshToken(m.token,verifiedClientId);                
                this.logger.info({
                    message: "Revoked token",
                    correlationId:(<any>req).correlationId,
                    meta: {token: m.token},
                    date: moment().toISOString()
                });
       
                res.sendStatus(200);
    
            } catch (e) {
                this.logger.error({
                    message: "Failed token revocation request",
                    correlationId:(<any>req).correlationId,
                    meta: {token: m.token},
                    error: e,
                    date: moment().toISOString()
                });
            }


        };

        // decide whether to validate based on body or query parameters

        return [
            urlencoded(),
            body('token').isString(),
            body('token_type').isString().equals("refresh_token").optional(),

            validationErrorMiddleware,
            RevocationResponder
        ];
    }
} 

export {RevokeMiddleware}