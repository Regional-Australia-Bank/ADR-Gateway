import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, check, body} from 'express-validator'
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { JWT, JWKS, JSONWebKeySet } from "jose";
import bodyParser from "body-parser";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import moment from "moment";
import { OIDCConfiguration, DhServerConfig } from "../Config";
import { ConsentManager, Consent } from "../../Entities/Consent";
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { axios } from "../../../../Common/Axios/axios";
import { GatewayContext } from "../../../../Common/Server/Types";
import { ClientCertificateInjector } from "../../../../Common/Services/ClientCertificateInjection";

// TODO, probably a lot of other things to check here


@injectable()
class ClientAccessTokenMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("CdrRegisterKeystoreProvider") private getRegisterKeystore: () => Promise<JSONWebKeySet>,
        @inject("PrivateKeystore") private ownKeystore:() => Promise<JWKS.KeyStore>,
        @inject("DhServerConfig") private config: () => Promise<DhServerConfig>,
        @inject("ClientCertificateInjector") private mtls: ClientCertificateInjector,
        private consentManager:ConsentManager,
        private tokenIssuer: TokenIssuer,
        @inject("OIDCConfiguration") private oidcConfig: (cfg:DhServerConfig) => OIDCConfiguration
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
                client_assertion: string
                grant_type: 'refresh_token'|'authorization_code'|'client_credentials'
                code: string
                refresh_token: string
                client_id: string
            } = <any>matchedData(req)

            let clientCertThumbprint = (<GatewayContext>(<any>req).gatewayContext).clientCert?.thumbprint
            if (typeof clientCertThumbprint !== 'string') return res.status(403).json("No client certificate provided");

            if (params.grant_type == 'client_credentials') {

                // TODO move this client credntial check to an auth middleware
                let client = await this.clientRegistrationManager.GetRegistration(params.client_id);

                if (typeof client == 'undefined') return res.status(400).json({error:"invalid_client"});
    
                // GET the JWKS for signing
                let client_jwks = JWKS.asKeyStore(await (await axios.get(client.jwks_uri, this.mtls.injectCa({responseType:"json"}))).data)
    
                // verify the JWT
                let payload:object;
                try {
                    payload = JWT.verify(params.client_assertion,client_jwks,{algorithms:["PS256"]})
                } catch (e) {
                    return res.status(401).json({error:"invalid_client"})
                }
    
                let authTime = moment().utc().unix()
    
                let cnf = await this.config();
                let oidcConfig = this.oidcConfig(cnf);

                let expires_in = 600;
                let access_token = JWT.sign({
                    iss: oidcConfig.issuer,
                    sub: client.clientId, // TODO implement PairwiseAlg from openID connect - ensures PPID cannot be compared by two DR's for example.
                    aud: oidcConfig.token_endpoint,
                    exp: authTime + expires_in, // TODO clarify the CDR requirement for exp time (assuming 120 seconds)
                    iat: authTime,
                    scope: "cdr:registration",
                    // nbf: authTime // BUG 2919 not before need to be sent
                },(await this.ownKeystore()).get({use:"sig",alg:"PS256"}))
    
                res.status(200).json(
                    {
                        access_token,
                        token_type: "bearer",
                        expires_in
                    }
                );
            } else {
                let consent: Consent|undefined;
                if (params.grant_type == 'authorization_code') {
                    consent = await this.consentManager.getTokenByAuthCode(params,clientCertThumbprint);
                } else if (params.grant_type == 'refresh_token') {
                    try {
                        consent = await this.consentManager.getTokenByRefreshToken(params,clientCertThumbprint);                        
                    } catch (e) {
                        if (e == 'Consent.AssertValidAndCurrent error') {
                            return res.status(400).json({error:"invalid_grant"})
                        } else {
                            return res.status(500).json()
                        }
                    }
                }
                
                if (typeof consent == 'undefined') throw 'Consent is undefined' // TODO return a valid OAuth response

                let tokenData = await this.tokenIssuer.TokenIDTokenPair(consent);
                return res.send(_.omitBy(tokenData,_.isNil));
    
            }

            // JWT.decode(jwt,{})
  
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
            bodyParser.urlencoded({extended:true}),
            check("grant_type").isIn(['refresh_token','authorization_code','client_credentials']).withMessage("grant_type must be refresh_token or authorization_code").bail(),
            body('code').isString().optional(),
            body('refresh_token').isString().optional(),
            body().custom( (b) => {
                if (b.grant_type == 'authorization_code') {
                    if (typeof b.code != 'string') throw 'code not supplied';
                    return true;
                    
                }
                if (b.grant_type == 'refresh_token') {
                    if (typeof b.refresh_token != 'string') throw 'refresh_token not supplied';
                    return true;
                }
                if (b.grant_type == 'client_credentials') {
                    return true;
                }
                throw 'Logic error in validating token request body'; // should never get here
            }).bail(),
            body('scope').isString().optional(),
            check("client_id").isString(),
            // TODO Implemement the full suite of validation (i.e. to validate the JWT client assertion and match against MTLS)
            body('client_assertion_type').isString().equals("urn:ietf:params:oauth:client-assertion-type:jwt-bearer").withMessage("invalid client_assertion_type"),
            check("client_assertion").isJWT()            
        ],[
            <any>validationErrorMiddleware,
            Responder
        ])
    }

}

export {ClientAccessTokenMiddleware}