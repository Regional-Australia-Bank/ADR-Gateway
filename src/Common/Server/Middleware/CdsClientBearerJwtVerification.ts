import express, { request } from "express";
import { NextFunction } from "connect";
import { GatewayRequest } from "../../../Common/Server/Types";
import winston from "winston";
import {JWKS} from "jose"
import { IncomingMessage } from "http";
import { BearerJwtVerifier } from "../../SecurityProfile/Logic.ClientAuthentication";
import { inject, injectable } from "tsyringe";
import urljoin from "url-join";
import { JoseBindingConfig } from "../Config";
import { GetOpts } from "../../../Common/Connectivity/Types";

@injectable()
export class ClientBearerJwtVerificationMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        private jwtVerifier: BearerJwtVerifier,
        @inject("JoseBindingConfig") private configFn:() => Promise<JoseBindingConfig>
    ) {}

    verifyClientId = async (
        acceptableClientId:string|undefined,
        authHeaderValue:string | undefined,
        audienceBaseUri:string,
        GetJwks: (assumedClientId:string) => {
            GetWithHealing: ($?: GetOpts<any>) => Promise<JWKS.KeyStore>
        }
    ) => {

        this.logger.debug("ClientBearerJwtVerification: Auth header.", {acceptableClientId, authHeaderValue, audienceBaseUri})

        return await this.jwtVerifier.verifyClientId(acceptableClientId, authHeaderValue, audienceBaseUri, GetJwks)

    }

    // TODO apply to the Dataholder Metadata endpoint
    handler = (
        GetJwks: (assumedClientId:string) => {
            GetWithHealing: ($?: GetOpts<any>) => Promise<JWKS.KeyStore>
        },
        acceptableClientId?:string
    ) => {
        return async (req:IncomingMessage & express.Request,res:express.Response,next: NextFunction) => {
            // extract the base Uri from the url
            try {
                let config = await this.configFn()

                let audienceBaseUri:string;
                try {
                    let applicationBase:string = config.SecurityProfile.JoseApplicationBaseUrl;
                    if (typeof applicationBase == 'undefined') throw new Error("JoseApplicationBaseUrl is not configured");
                    if (typeof req?.route?.path == 'undefined') throw new Error("Request cannot be parsed")
                    
                    if (config.SecurityProfile.AudienceRewriteRules && config.SecurityProfile.AudienceRewriteRules[req.path]) {
                        audienceBaseUri = urljoin(applicationBase,config.SecurityProfile.AudienceRewriteRules[req.path]);
                    } else {
                        audienceBaseUri = urljoin(applicationBase,req.path);    
                    }
                }
                catch (err) {
                    throw new Error("Request uri cannot be parsed")
                }
            
    
                try {
                    let verifiedClientId = await this.verifyClientId(acceptableClientId,req.headers['authorization'],audienceBaseUri,GetJwks);
                    (req as GatewayRequest).gatewayContext = (req as GatewayRequest).gatewayContext || {};
                    (req as GatewayRequest).gatewayContext.verifiedBearerJwtClientId = verifiedClientId;
    
                } catch (err) {
                    this.logger.error("Client certificate bearer JWT verification error",err);
                    return res.status(400).json({
                        error: "invalid_client"
                    });
                }
    
                next();
    
            } catch(err) {
                this.logger.error("Client certificate bearer JWT verification error",err);
                res.status(500).send("Client certificate bearer JWT verification error");

            }
        };
    }
}