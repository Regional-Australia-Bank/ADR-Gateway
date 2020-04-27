import { IncomingMessage } from "http";
import { readFileSync, ftruncate } from "fs";
import winston = require("winston");
import { IClientCertificateVerificationConfig, IAppConfig } from "../Server/Config";
import { injectable, singleton, inject } from "tsyringe";

interface IClientCertificateVerifier {
    verify(req: IncomingMessage, logger: winston.Logger):Promise<string>;
}

@injectable()
@singleton()
class ThumbprintHeaderClientCertificateVerifier implements IClientCertificateVerifier {
    private thumbprintHeader: string;

    constructor(@inject("IClientCertificateVerificationConfig") config:IClientCertificateVerificationConfig) {
        this.thumbprintHeader = config.Headers.ThumbprintHeader;
    }
    
    async verify(req: IncomingMessage, logger: winston.Logger): Promise<string> {
        try {
            let thumbprint = req.headers[this.thumbprintHeader];
            if (typeof thumbprint != 'string') {
                throw new Error("Expected exactly one client certificate thumbprint header: "+this.thumbprintHeader);
            }
            return thumbprint;
        } catch (err) {
            logger.error("",err);
            throw new Error("Client certificate could not be verified");
        }
    }
}

import {BearerJwtVerifier as bjv} from './Logic.ClientAuthentication'
namespace ClientAuthentication {
    const BearerJwtVerifier = bjv;
}

export {
    ThumbprintHeaderClientCertificateVerifier,
    IClientCertificateVerifier,
    ClientAuthentication
};