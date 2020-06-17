import winston = require("winston");
import { MockRegister, Client } from "./server";
import { GetJwks } from "../../../Common/Init/Jwks";
import { JWKS } from "jose";
import { DefaultPathways } from "../../../AdrGateway/Server/Connectivity/Pathways";
import { DefaultClientCertificateInjector, DevClientCertificateInjector, ClientCertificateInjector } from "../../../AdrGateway/Services/ClientCertificateInjection";


import { MtlsConfig, AdrConnectivityConfig } from "../../../AdrGateway/Config";
import { MockRegisterConfig } from "./Config";
import { NeuronFactory } from "../../../AdrGateway/Server/Connectivity/NeuronFactory";

export namespace MockRegisterServerStartup {
    export async function Start(configFn:() => Promise<MockRegisterConfig>,clientProvider:(clientId:string) => Promise<Client>) {
        const config = await configFn()

        let jwks = config.Jwks

        let port = config.Port;

        let mtlsConfig = (await configFn()).LiveRegisterProxy.mtls;

        let cert:ClientCertificateInjector;
        if (mtlsConfig?.cert) {
            cert = new DefaultClientCertificateInjector(mtlsConfig)
        } else {
            cert = new DevClientCertificateInjector()
        }

        const pathwaysConfigFn = async () => {
            const config = await configFn();

            // A stub configuration to enable the Mock Register to connect to a live register
            let adrConnectivityConfig:AdrConnectivityConfig = config.LiveRegisterProxy
            return adrConnectivityConfig
        }
        let logger = <winston.Logger>winston.createLogger({
            level:"debug",
            transports: [
                new winston.transports.Console({
                    handleExceptions: true,
                    level: "debug"
                })]
            })

        const pw = new DefaultPathways(pathwaysConfigFn,cert,logger,<any>undefined,<any>undefined,new NeuronFactory(logger));

        let app = await new MockRegister(configFn,clientProvider,pw).init()
        

        return {port, server:app.listen(port, () => {
            logger.info(`mock-register started at http://localhost:${port}`);
        })}
    }
}
