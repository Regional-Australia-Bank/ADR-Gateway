import { Dictionary } from "../../../../Common/Server/Types";
import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";
import { getType } from "mime";

import {check, validationResult, query, ValidationChain, body, matchedData, checkSchema, Schema} from 'express-validator'
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { JWK } from "jose";
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { ConsentManager } from "../../Entities/Consent";
import uuid from "uuid";

const requestSchema:Schema = {
    id: { isInt: { options: { min: 1 }, errorMessage: "requestId must be a positive integer" } },
    user_id: { isString: { errorMessage: "user_id must be a string" }, isLength: {options: {min: 5}, errorMessage: "user_id must be at least length 5"} },
    scopes: {isArray:true, errorMessage: "authorized scopes must be presented as an array"},
    'scopes.*': {isString: true, errorMessage: "all scopes must be strings"}
};

@injectable()
export class GrantConsentMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentManager,
        private tokenIssuer:TokenIssuer
    ) { }

    GrantConsent = async (grantOptions: {user_id:string, request_id:number, scopes: string[]}) => {

            let consentRequestState = await this.consentManager.getConsentRequestState(grantOptions.request_id);
        
            // const ppid = uuid.v4();
            // TODO generated based on actual customer number. Must be consistent across consents AND follow rules here: https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes
            const ppid = 'fb2eac89-81a7-4b04-8db2-6c9c82c349fa'
        
            const authPackage = await this.tokenIssuer.AuthCodeIDTokenPair(
                // TODO generate PPID
                {ppid: ppid},
                consentRequestState)
        
            let updatedConsent = await this.consentManager.confirmConsent(grantOptions.request_id,{
                subjectPpid: ppid,
                authCode: authPackage.code,
                personId: grantOptions.user_id,
                scopes: grantOptions.scopes
            });
        
            let responseData:any = _.omitBy({
                code: authPackage.code,
                id_token: authPackage.id_token,
                state: updatedConsent.state
            }, _.isNil);
        
            let fragment = _.map(responseData,(v,k) => encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&")
        
            // TODO do redirect instead of merely describing one
        
            return updatedConsent.redirect_uri + "#" + fragment;
        }

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response,next: NextFunction) => {
    
            let m:{
                id: number,
                user_id: string,
                scopes: string[]
            } = <any>matchedData(req);

            let redirect_uri = await this.GrantConsent({user_id: m.user_id, request_id: m.id, scopes: m.scopes});
    
            // TODO do redirect instead of merely describing one
            return res.json({code: 302, url: redirect_uri})          
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([express.json()],<any>checkSchema(requestSchema,['body']),[validationErrorMiddleware,Responder])
    }

}
