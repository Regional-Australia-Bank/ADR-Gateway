import winston = require("winston");
import * as Transport from 'winston-transport';
import { container } from "../AdrGwContainer";
import { AdrGatewayConfig, AdrConnectivityConfig } from "../Config";
import * as fs from "fs"
import { JWKS } from "jose";
import { Connection, createConnection, EntitySchema, BaseEntity } from "typeorm";
import { ConsentRequestLog } from "../Entities/ConsentRequestLog";
import * as _ from "lodash"
import { DevClientCertificateInjector, DefaultClientCertificateInjector } from "../Services/ClientCertificateInjection";
import { DataHolderRegistration } from "../Entities/DataHolderRegistration";
import { SelfHealingDataHolderMetadataProvider } from "../Services/DataholderMetadata";
import { InMemoryCache } from "./Connectivity/Cache/InMemoryCache";
import { AbstractCache } from "./Connectivity/Cache/AbstractCache";
import { DefaultCache } from "./Connectivity/Cache/DefaultCache";
import * as http from "http"
import { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from "axios";
import { configReplacer, axiosReplacer, errorReplacer, combineReplacers } from "../../Common/LogReplacers";

export const EntityDefaults = {
    type: "sqlite",
    database: ":memory:",
    entityPrefix: "adr_",
    synchronize: true,
    entities: [ConsentRequestLog, DataHolderRegistration]
};

async function RegisterDependencies(configFn:() => Promise<AdrConnectivityConfig>, db?: Promise<Connection>): Promise<void> {
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
    if (config.mtls?.ca) {
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
    container.register("Cache", { useValue: new DefaultCache() })

}

export { RegisterDependencies }