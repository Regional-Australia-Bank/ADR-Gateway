import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import {check, validationResult, query, ValidationChain, body, matchedData, param} from 'express-validator'
import { injectable, inject } from "tsyringe";
import winston from "winston";
import bodyParser, { urlencoded } from "body-parser";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../../Common/Entities/ConsentRequestLog";
import { AdrServerConfig } from "../Config";
import moment from "moment";
import { GatewayRequest } from "../../../Common/Server/Types";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";

@injectable()
export class DeleteArrangementMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentRequestLogManager,
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

            let m:{
                cdr_arrangement_id: string
            } = <any>matchedData(req);

            let verifiedClientId = (req as GatewayRequest)?.gatewayContext?.verifiedBearerJwtClientId

            this.logger.debug({
                message: "Received arrangement revocation request",
                meta: {token: m.cdr_arrangement_id, verifiedClientId},
                date: moment().toISOString()
            });

            try {
    
                let consentManager = this.consentManager;
                let consents:ConsentRequestLog[] = await consentManager.GetConsentsByDeleteArrangementParams(m.cdr_arrangement_id,verifiedClientId);

                // only revoke current consents
                consents = consents.filter(c => c.IsCurrent());
                
                if (consents.length < 1) {
                    return res.sendStatus(422);
                }

                for (let consent of consents) {
                    await consentManager.RevokeConsent(consent,"DataHolder");
                    this.logger.info({
                        message: "Revoked consent",
                        correlationId:(<any>req).correlationId,
                        meta: {cdr_arrangement_id: m.cdr_arrangement_id},
                        date: moment().toISOString()
                    });
    
                }
      
                return res.sendStatus(204);
    
            } catch (e) {
                this.logger.error({
                    message: "Failed token revocation request",
                    correlationId:(<any>req).correlationId,
                    meta: {token: m.cdr_arrangement_id},
                    error: e,
                    date: moment().toISOString()
                });
            }


        };

        // decide whether to validate based on body or query parameters

        return [
            param('cdr_arrangement_id').isString(),
            validationErrorMiddleware,
            RevocationResponder
        ];
    }
} 
