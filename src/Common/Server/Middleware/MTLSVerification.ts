import express from "express";
import { NextFunction } from "connect";
import { GatewayRequest } from "../Types";
import { IClientCertificateVerifier } from "../../SecurityProfile/Logic";
import winston from "winston";
import {singleton, injectable, inject} from "tsyringe"

@singleton()
@injectable()
class MTLSVerificationMiddleware {

    constructor(
        @inject("IClientCertificateVerifier") private certVerifier: IClientCertificateVerifier,
        @inject("Logger") private logger: winston.Logger
    ){}

    /**
     * This middleware ensures that the MTLS client certificate (as terminated by APIM) is valid and verified as a member of the CDR ecosystem.
     * @param req 
     * @param res 
     * @param next 
     */
    handle = async (req:express.Request,res:express.Response,next: NextFunction) => {
        // check client certificate
    
        try {
            (req as GatewayRequest).gatewayContext.clientCert = (req as GatewayRequest).gatewayContext.clientCert || {};
            (req as GatewayRequest).gatewayContext.clientCert.thumbprint = await this.certVerifier.verify(req,this.logger);
        } catch (err) {
            this.logger.error("Client certificate verification error",err);
            res.status(401).send();
            return;
        }
        
        next();
    };   

}

export {MTLSVerificationMiddleware}