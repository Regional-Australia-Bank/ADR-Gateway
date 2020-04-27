import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import { IncomingMessage } from "http";
import { Dictionary } from "../../../Common/Server/Types";
import winston from "winston";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog";
import { validationResult, matchedData, param } from "express-validator";
import * as _ from "lodash";
import { AdrGatewayConfig } from "../../Config";
import { CatchPromiseRejection } from "./ErrorHandling";
import { DefaultPathways } from "../Connectivity/Pathways";


@injectable()
class ConsentDeletionMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        private pw: DefaultPathways,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        private consentManager:ConsentRequestLogManager
    ) { }

    DeleteConsent = async (consentId:number) => {
        let consent:ConsentRequestLog;
        try {
            consent = await this.consentManager.GetConsent(consentId);   // TODO consider returning undefined from GetConsent??
        } catch {
            return {
                found: false,
                deleted: false
            }
        }

        if (!consent.IsCurrent()) return {
            found: true,
            deleted: false
        };

        await this.consentManager.RevokeConsent(consent,"DataRecipient");

        return {found: true, deleted: true, consent}
    }

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response) => {
    
            let m:{consentId:number} = <any>matchedData(req);

            this.logger.info(`Requested revocation of consent: ${m.consentId}`);

            let status:{found:boolean,deleted:boolean,consent?:ConsentRequestLog} = await this.DeleteConsent(m.consentId);
    
            if (!status.found) return res.status(404).send();
            if (!status.deleted) return res.status(409).send();

            try {
                // this is purposely not awaited. It should not block the sending of a 200 response.
                this.pw.PropagateRevokeConsent(status.consent).GetWithHealing().catch(e => this.pw.logger.error({message:"Could not propagate consent revocation", meta: status.consent}))
            } finally {
                return res.status(200).send();
            }

        };
    
        // decide whether to validate based on body or query parameters
        return _.concat(
            [
                param('consentId').isInt({min:0}),
                validationErrorMiddleware,
                CatchPromiseRejection(Responder)
            ])
    }

}

export {ConsentDeletionMiddleware}