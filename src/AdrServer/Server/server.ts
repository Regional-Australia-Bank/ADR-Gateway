import "reflect-metadata";

import express from "express";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { RevokeMiddleware } from "./Handlers/Revoke";
import { DefaultPathways } from "../../AdrGateway/Server/Connectivity/Pathways";
import { ClientBearerJwtVerificationMiddleware } from "../../Common/Server/Middleware/CdsClientBearerJwtVerification";
import { BearerJwtVerifier } from "../../Common/SecurityProfile/Logic.ClientAuthentication";
import { JtiLogManager } from "../../Common/Entities/JtiLog";
import uuid from "uuid"
import http from "http"

const requestCorrelationMiddleware = (req,res:http.ServerResponse,next) => {
    req.correlationId = uuid.v4()
    res.setHeader(process.env.CORRELATION_ID_HEADER || "adr-correlation-id",req.correlationId)
    next()
}

@injectable()
export class AdrServer {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private revocationMiddleware: RevokeMiddleware,
        private pw: DefaultPathways,
        private clientBearerJwtVerificationMiddleware: ClientBearerJwtVerificationMiddleware
    ) {}

    init(): ReturnType<typeof express> {
        const app = express();       
       
        app.use(requestCorrelationMiddleware)

        app.get( "/jwks", async ( req, res ) => {
            // output the public portion of the key
          
            res.setHeader("content-type","application/json");
            res.send((await this.pw.DataRecipientJwks().GetWithHealing()).toJWKS(false));
            this.logger.info("Someone requested JWKS")
            
        } );
               
        app.post( "/revoke",
            this.clientBearerJwtVerificationMiddleware.handler(async (assumedClientId:string) => {
                return await this.pw.DataHolderJwks(assumedClientId).GetWithHealing()
            }),
            this.revocationMiddleware.handler()
        );
        
        return app;
       
    }
}
