import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../Common/Entities/JtiLog";
import winston from "winston";
import * as Transport from 'winston-transport';
import { ConsentRequestLog } from "../../Common/Entities/ConsentRequestLog";
import _ from "lodash"
import { container } from "../AdrDiContainer";
import { DevClientCertificateInjector, DefaultClientCertificateInjector } from "../../Common/Services/ClientCertificateInjection";
import { AdrServerConfig } from "./Config";
import { DefaultCache } from "../../Common/Connectivity/Cache/DefaultCache";
import { combineReplacers, errorReplacer, configReplacer, axiosReplacer } from "../../Common/LogReplacers";

async function RegisterDependencies(configFn:() => Promise<AdrServerConfig>,db?:Promise<Connection>): Promise<void> {
    let config = await configFn();

    const level = process.env.LOG_LEVEL || "warn";

    const transports:Transport[] = [
        new winston.transports.Console({
            handleExceptions: true,
            level
        }),
    ];
    if (process.env.LOG_FILE) {
        transports.push(new winston.transports.File({ filename: process.env.LOG_FILE, level }))
    }

    const logger = winston.createLogger({
        transports,
        exitOnError: false,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json({
            replacer: combineReplacers(errorReplacer,configReplacer,axiosReplacer)
          })
        )
      });


    container.register("Logger",{useValue:logger})
    container.register("AdrConnectivityConfig",{useValue:configFn})
    container.register("AdrServerConfig",{useValue:configFn}) // TODO cleanup so there is only one config
    container.register("JoseBindingConfig",{useValue:configFn}) // TODO cleanup so there is only one config
    container.register("Cache", { useValue: new DefaultCache() })

    if (config.mtls?.ca) {
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
        entityPrefix: "adr_",
        synchronize: false,
        entities: [JtiLog, ConsentRequestLog]
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