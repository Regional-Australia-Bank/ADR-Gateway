import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, check, body} from 'express-validator'
import { inject, injectable } from "tsyringe";
import { JWT, JWKS } from "jose";
import bodyParser from "body-parser";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import { axios } from "../../../../Common/Axios/axios";
import { ClientCertificateInjector } from "../../../../Common/Services/ClientCertificateInjection";
import { Dictionary } from "../../../../Common/Server/Types";
import uuid from "uuid";

const storedRequests:Dictionary<string> = {};

export const GetStagedRequestById = (id:string) => {
    return storedRequests[id]
}

@injectable()
export class PushedAuthorizationRequestMiddleware {
    constructor(
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("ClientCertificateInjector") private mtls: ClientCertificateInjector,
    ){}


    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ error: "invalid_request" });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response,next: NextFunction) => {
    
            res.setHeader('Cache-Control','no-store')
            res.setHeader('Pragma','no-cache')
            
            let params:{
                request: string
                client_id: string,
                client_assertion: string,
                scope?: string,
                response_type?: string
            } = <any>matchedData(req)

            // TODO move this client credntial check to an auth middleware
            let client = await this.clientRegistrationManager.GetRegistration(params.client_id);

            if (typeof client == 'undefined') return res.status(401).json({error:"invalid_client"});

            // GET the JWKS for signing
            let client_jwks = JWKS.asKeyStore(await (await axios.get(client.jwks_uri, this.mtls.injectCa({responseType:"json"}))).data)

            // verify the JWT
            let payload:any;
            try {
                payload = JWT.verify(params.client_assertion,client_jwks,{algorithms:["PS256"]})
                for (let key of ['aud','jti','exp','iss','sub'])
                if (typeof payload[key] === 'undefined')  {
                    throw `key ${key} is missing from JWT`
                }

                if (payload.sub !== params.client_id) throw "client_id mismatch"
            } catch (e) {
                return res.status(401).json({error:"invalid_client"})
            }

            // verify the requestObject JWT
            let requestObject:any;
            try {
                // payload = JWT.decode(params.request)
                requestObject = JWT.verify(params.request,client_jwks,{algorithms:["PS256"]})
                for (let key of ['aud','exp','iss']) {
                    if (typeof payload[key] === 'undefined')  {
                        throw `key ${key} is missing from JWT`
                    }    
                }

                if (requestObject.client_id !== params.client_id) throw "client_id mismatch"
            } catch (e) {
                return res.status(401).json({error:"invalid_client"})
            }

            if (typeof params.scope !== "string" || params.scope !== requestObject.scope) {
                return res.status(401).json({error:"invalid_request"});
            }

            if (typeof params.response_type !== "string" || params.response_type !== requestObject.response_type) {
                return res.status(401).json({error:"invalid_request"});
            }

            const request_uri = "par:"+uuid.v4();

            storedRequests[request_uri] = requestObject;

            return res.json({
                request_uri,
                expiry: 90 // this is not enforced
            })
 
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
            bodyParser.urlencoded({extended:true}),
            body("request").isJWT(),
            body("client_id").isString(),
            body('client_assertion_type').isString().equals("urn:ietf:params:oauth:client-assertion-type:jwt-bearer").withMessage("invalid client_assertion_type"),
            body("client_assertion").isJWT(),
            body("scope").optional().isString(),
            body("response_type").optional().isString()
        ],[
            <any>validationErrorMiddleware,
            Responder
        ])
    }

}
