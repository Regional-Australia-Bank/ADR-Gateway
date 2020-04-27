import {singleton} from "tsyringe";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../Common/Entities/JtiLog";
import { ClientJwks } from "../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../Common/Entities/MetadataUpdateLog";
import winston from "winston";
import { ConsentRequestLog } from "../../AdrGateway/Entities/ConsentRequestLog";
import * as _ from "lodash"
import { container } from "../AdrDiContainer";
import { DevClientCertificateInjector, DefaultClientCertificateInjector } from "../../AdrGateway/Services/ClientCertificateInjection";
import { AdrServerConfig } from "./Config";

async function RegisterDependencies(configFn:() => Promise<AdrServerConfig>,db?:Promise<Connection>): Promise<void> {
    let config = await configFn();
    const logger = winston.createLogger({
        transports: [
          new winston.transports.Console({
            handleExceptions: true
          }),
          new winston.transports.File({filename: "log.txt", level: process.env.LOG_LEVEL || "error"}) // TODO properly configure this
        ],
        exitOnError: false,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.prettyPrint()
        )
      });


    container.register("Logger",{useValue:logger})
    container.register("AdrConnectivityConfig",{useValue:configFn})
    container.register("AdrServerConfig",{useValue:configFn}) // TODO cleanup so there is only one config
    container.register("IAppConfig",{useValue:configFn}) // TODO cleanup so there is only one config

    if (config.mtls) {
      container.register("ClientCertificateInjector", {
          useValue: new DefaultClientCertificateInjector(
              config.mtls
          )
      })
    } else {
        container.register("ClientCertificateInjector", { useClass: DevClientCertificateInjector })
    }

    let connection = db || (()=>{
      let options = _.merge({
        type: "sqlite",
        database: ":memory:",
        entityPrefix: process.env.ENTITY_PREFIX || "adr_",
        synchronize: true,
        entities: [JtiLog, ClientJwks, MetadataUpdateLog, ConsentRequestLog]
      },config.Database);
      return createConnection(options)

    })()

    container.register<Promise<Connection>>(
    "Promise<Connection>",
    {
        useValue: connection
    });
   
}

export {RegisterDependencies}