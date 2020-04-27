import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../../Common/Entities/JtiLog";
import { ClientJwks } from "../../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../../Common/Entities/MetadataUpdateLog";
import winston from "winston";
import { JWKS, JWK } from "jose";
import { container } from "../../../AdrServer/AdrDiContainer";
import { ConsentRequestLog } from "../../../AdrGateway/Entities/ConsentRequestLog";
import { DevClientCertificateInjector } from "../../../AdrGateway/Services/ClientCertificateInjection";

function RegisterTestDependencies(): void {
    container.reset();
    const jwks = new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })]);
    container.registerInstance<JWKS.KeyStore>("PrivateKeystore",jwks)

    const logger = winston.createLogger({
        transports: [
          new winston.transports.Console({
            handleExceptions: true
          }),
          new winston.transports.File({filename: "log.txt"})
        ],
        exitOnError: false
      });


    const config:any = {
      SecurityProfile: {
        JoseApplicationBaseUrl: "https://adr.mocking",
        AudienceRewriteRules: {
          "/revoke":"/security/revoke"
        }
      },
      Jwks: jwks
    };

    container.register("Logger",{useValue:logger})
    container.register("IAppConfig",{useValue:config})
    container.register("EcosystemConfig",{useValue:config}) // TODO cleanup so there is only one config
    container.register("ClientCertificateInjector",{useClass: DevClientCertificateInjector})


    container.register<Promise<Connection>>(
        "Promise<Connection>",
        {
            useValue: (()=>{
     
                return createConnection({
                  type: "sqlite",
                  database: ":memory:",
                  entityPrefix: "adr_",
                  synchronize: true,
                  entities: [JtiLog, ClientJwks, MetadataUpdateLog, ConsentRequestLog]
                }).then(async c => {
                    if (!c.isConnected) {
                        await c.connect();
                    }
                    return c;
                    // return await c.connect()
                });
      
              })()
        });
    
}

export {RegisterTestDependencies}