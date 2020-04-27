import {singleton} from "tsyringe";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../../Common/Entities/JtiLog";
import { ClientJwks } from "../../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../../Common/Entities/MetadataUpdateLog";
import winston from "winston";
import { ThumbprintHeaderClientCertificateVerifier } from "../../../Common/SecurityProfile/Logic";
import { IClientCertificateVerificationConfig } from "../../../Common/Server/Config";
import { JWKS, JWK } from "jose";
import { Consent } from "../../../MockServices/DhServer/Entities/Consent";
import { DefaultOIDCConfiguration } from "../../../MockServices/DhServer/Server/Config";
import { container } from "../../../MockServices/DhServer/DhDiContainer";
import { ClientRegistration } from "../../../MockServices/DhServer/Entities/ClientRegistration";

function RegisterTestDependencies(): void {
    container.registerInstance<JWKS.KeyStore>("PrivateKeystore",new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })]))

    const logger = winston.createLogger({
        transports: [
          new winston.transports.Console({
            handleExceptions: true
          }),
          new winston.transports.File({filename: "log.txt"})
        ],
        exitOnError: false
      });
    container.register("Logger",{useValue:logger})

    container.register("OIDCConfiguration",{useValue:DefaultOIDCConfiguration});
    container.register("IClientCertificateVerifier",{useClass:ThumbprintHeaderClientCertificateVerifier});
    container.register<IClientCertificateVerificationConfig>("IClientCertificateVerificationConfig",{useValue:{
        Headers:{
            ThumbprintHeader: "x-cdrgw-cert-thumbprint"
        }
    }});

    container.register<Promise<Connection>>(
        "Promise<Connection>",
        {
            useValue: createConnection({
                type: "sqlite",
                database: ":memory:", // :memory
                entityPrefix: "dh_",
                synchronize: true,
                entities: [ClientJwks, JtiLog, MetadataUpdateLog, Consent, ClientRegistration]
            })
        });
    
}

export {RegisterTestDependencies}