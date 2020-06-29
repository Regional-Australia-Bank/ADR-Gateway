import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import { IncomingMessage } from "http";
import { Dictionary } from "../../../Common/Server/Types";
import winston from "winston";
import { ConsentRequestLogManager } from "../../Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, query } from "express-validator";
import { DataHolderMetadataProvider, Dataholder } from "../../Services/DataholderMetadata";
import * as _ from "lodash";
import { AdrGatewayConfig } from "../../Config";
import uuid from "uuid";
import { getAuthPostGetRequestUrl } from "../Helpers/HybridAuthJWS";
import { JWKS } from "jose";
import { ConsentRequestParams } from "../Connectivity/Neurons/AuthorizationRequest";
import { DefaultPathways } from "../Connectivity/Pathways";
import { NoneFoundError } from "../Connectivity/Errors";



const bodySchema:Schema = {
    sharingDuration: {
        isInt: {
            errorMessage: "sharingDuration must be a positive integer"
        },
        custom: {
            options: (input) => {
                let i = parseInt(input);
                let min = parseInt(process.env.TEST_HARNESS_MIN_SHARING_DURATION || "0");
                if (i < min) {
                    throw `sharingDuration must be at least ${min}`
                }
                return true;
            }
        }
    },
    additionalClaims: { },
    dataholderBrandId: { isString: { errorMessage: "dataholderBrandId must be a string" }, isLength: {options: {min: 5}, errorMessage: "dataholderBrandId must be at least length 5"} },
    productKey: { isString: { errorMessage: "productKey must be a string" }, isLength: {options: {min: 1}, errorMessage: "productKey must be at least length 1"} },
    userId: { isString: { errorMessage: "userId must be a string" }, isLength: {options: {min: 5}, errorMessage: "userId must be at least length 5"} },
    systemId: { isString: { errorMessage: "systemId must be a string" }, isLength: {options: {min: 1}, errorMessage: "systemId must be at least length 1"} },
    state: { isString: { errorMessage: "state must be a string" }, isLength: {options: {min: 5}, errorMessage: "state must be at least length 5"} },
    scopes: {isArray:true, errorMessage: "authorized scopes must be presented as an array"},
    'scopes.*': {isString: true, errorMessage: "all scopes must be strings"}
};

const querySchema:Schema = {
};



@injectable()
class ConsentRequestMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<Dataholder>,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        private pathways: DefaultPathways,
        // private tokenRequestor: TokenRequestor,
        private consentManager:ConsentRequestLogManager
    ) { }

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response) => {
    
            let m:ConsentRequestParams = <any>matchedData(req);

            try {
                let redirect_uri = await this.RequestConsent(m);
                return res.json(redirect_uri)          
            } catch (e) {
                if (e instanceof NoneFoundError) {
                    return res.status(404).send();
                }
                this.logger.error("Could not generate consent URL",e)
                return res.status(500).send();
            }
            // TODO do redirect instead of merely describing one
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat(
            [
                express.json()
            ],
            <any>checkSchema(bodySchema,['body']),
            <any>checkSchema(querySchema,['query']),
            [
                query(),
                validationErrorMiddleware,
                Responder
            ])
    }

    RequestConsent = async (p: ConsentRequestParams) =>{
        this.logger.info(`Request for new consent at data holder: ${p.dataholderBrandId} for software product: ${p.productKey}`);
        let requestor = this.pathways.GetAuthorizationRequest(p);
        return (await requestor.Evaluate())

    }

}

export {ConsentRequestMiddleware}