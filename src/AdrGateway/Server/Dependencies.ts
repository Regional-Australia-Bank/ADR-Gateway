import winston = require("winston");
import { container } from "../AdrGwContainer";
import { AdrGatewayConfig } from "../Config";
import * as fs from "fs"
import { JWKS } from "jose";
import { Connection, createConnection, EntitySchema, BaseEntity } from "typeorm";
import { ConsentRequestLog } from "../Entities/ConsentRequestLog";
import * as _ from "lodash"
import { DevClientCertificateInjector, DefaultClientCertificateInjector } from "../Services/ClientCertificateInjection";
import { DataHolderRegistration } from "../Entities/DataHolderRegistration";
import { SelfHealingDataHolderMetadataProvider } from "../Services/DataholderMetadata";

export const EntityDefaults = {
    type: "sqlite",
    database: ":memory:",
    entityPrefix: process.env.ENTITY_PREFIX || "adr_",
    synchronize: true,
    entities: [ConsentRequestLog, DataHolderRegistration]
};

async function RegisterDependencies(configFn:() => Promise<AdrGatewayConfig>, db?: Promise<Connection>): Promise<void> {
    let config = await configFn();
    const logger = winston.createLogger({
        transports: [
            new winston.transports.Console({
                handleExceptions: true
            }),
            new winston.transports.File({ filename: process.env.LOG_FILE || "log.txt", level: process.env.LOG_LEVEL || "warning" })
        ],
        exitOnError: false,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.prettyPrint()
        )
    });

    let connection = db || (() => {
        let options = _.merge(EntityDefaults, config.Database);
        return createConnection(options)

    })()

    container.register<Promise<Connection>>(
        "Promise<Connection>",
        {
            useValue: connection
        });

    container.register("Logger", { useValue: logger })

    container.register("DataHolderMetadataProvider", { useClass: SelfHealingDataHolderMetadataProvider })

    // TODO replace the DevClientCertificate injector headers with actual certificate made with node-forge
    if (config.mtls) {
        container.register("ClientCertificateInjector", {
            useValue: new DefaultClientCertificateInjector(
                config.mtls
            )
        })
    } else {
        container.register("ClientCertificateInjector", { useClass: DevClientCertificateInjector })
    }

    container.register("AdrConnectivityConfig", { useValue: configFn })
    container.register("AdrGatewayConfig", { useValue: configFn }) // TODO cleanup so there is only one config

}

export { RegisterDependencies }