import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { Schema, validationResult, matchedData, checkSchema, query } from "express-validator";
import _ from "lodash";
import { NoneFoundError } from "../../../Common/Connectivity/Errors";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { ConsentRequestParams } from "../../../Common/Connectivity/Types";

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
    existingArrangementId: { optional: true, isString: { errorMessage: "existingArrangementId must be a string" }, isLength: {options: {min: 5}, errorMessage: "existingArrangementId must be at least length 5"} },
    productKey: { isString: { errorMessage: "productKey must be a string" }, isLength: {options: {min: 1}, errorMessage: "productKey must be at least length 1"} },
    userId: { isString: { errorMessage: "userId must be a string" }, isLength: {options: {min: 5}, errorMessage: "userId must be at least length 5"} },
    systemId: { isString: { errorMessage: "systemId must be a string" }, isLength: {options: {min: 1}, errorMessage: "systemId must be at least length 1"} },
    state: { isString: { errorMessage: "state must be a string" }, isLength: {options: {min: 5}, errorMessage: "state must be at least length 5"} },
    scopes: {isArray:true, errorMessage: "authorized scopes must be presented as an array"},
    'scopes.*': {isString: true, errorMessage: "all scopes must be strings"},
    redirectUri: {optional: true, isString: { errorMessage: "redirectUri must be a URI string"}}
};

const querySchema:Schema = {
};



@injectable()
class ConsentRequestMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        private connector: DefaultConnector
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
    
            let m:ConsentRequestParams = <any>matchedData(req, {includeOptionals: true});

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
        let requestor = this.connector.GetAuthorizationRequest(p);
        return (await requestor.Evaluate())

    }

}

export {ConsentRequestMiddleware}