import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import {validationResult} from 'express-validator'
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { ConsentManager, Consent } from "../../Entities/Consent";
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { urlencoded } from "body-parser";
import { DhGatewayRequest } from "../Types";
import uuid from "uuid";
import moment from "moment";


@injectable()
class UserInfoMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentManager,
        private tokenIssuer: TokenIssuer
    ){}
    
    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
            }
            next();
        }

        let UserInfoResponder = async (req:express.Request,res:express.Response,next: NextFunction) => {

            const consent = (<any>req as DhGatewayRequest).gatewayContext.consent;

            res.json({
                sub: consent.subjectPpid,
                acr: "urn:cds.au:cdr:2",
                auth_time: moment().utc().subtract(1,'month').unix(),
                name: "John Smith",
                given_name: "John",
                family_name: "Smith",
                updated_at: moment().utc().subtract(1,'day').unix(),
                refresh_token_expires_at: moment().utc().add(1,'day').unix(),
                cdr_arrangement_id: consent.cdr_arrangement_id,
                sharing_expires_at: moment().utc().add(1,'day').unix()
            });
       
        };

        // decide whether to validate based on body or query parameters

        return [
            urlencoded({extended:true}),
            validationErrorMiddleware,
            UserInfoResponder
        ];
    }
} 

export {UserInfoMiddleware}