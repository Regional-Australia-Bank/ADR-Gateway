import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import { IncomingMessage } from "http";
import { Dictionary } from "../../../Common/Server/Types";
import winston from "winston";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, query, param } from "express-validator";
import { DataHolderMetadataProvider, Dataholder } from "../../Services/DataholderMetadata";
import * as _ from "lodash";
import { AdrGatewayConfig } from "../../Config";
import uuid from "uuid";
import { getAuthPostGetRequestUrl } from "../Helpers/HybridAuthJWS";
import { JWKS } from "jose";
import { SerializeConsentDetails } from "./ConsentListing";

const querySchema:Schema = {
    userId: { isString: { errorMessage: "userId must be a string" }, isLength: {options: {min: 5}, errorMessage: "userId must be at least length 5"} },
    systemId: { isString: { errorMessage: "systemId must be a string" }, isLength: {options: {min: 1}, errorMessage: "systemId must be at least length 1"} },
};

interface UserParams {
    systemId: string,
    userId: string,
}

@injectable()
export class ConsentDetailsMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<Dataholder>,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        // private tokenRequestor: TokenRequestor,
        private consentManager:ConsentRequestLogManager
    ) { }

    handler = () => {
    
        let Responder = async (req:express.Request,res:express.Response) => {
    
            let m:any = <any>matchedData(req);

            let consent = await this.consentManager.GetConsentOrUndefined(m.consentId);
    
            // TODO do redirect instead of merely describing one

            if (consent) {
                return res.json(await SerializeConsentDetails(consent,this.dataHolderMetadataProvider))          
            } else {
                return res.status(404).json([])
            }
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat(
            [
                param('consentId').exists().toInt(),
                Responder
            ])
    }

}