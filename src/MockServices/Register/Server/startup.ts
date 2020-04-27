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

        let jwks = GetJwks(config)

        let port = config.Port;

        let mtlsConfig = (await configFn()).mtls;

        let cert:ClientCertificateInjector;
        if (mtlsConfig) {
            cert = new DefaultClientCertificateInjector(mtlsConfig)
        } else {
            cert = new DevClientCertificateInjector()
        }

        const pathwaysConfigFn = async () => {
            const config = await configFn();
            let adrConnectivityConfig:AdrConnectivityConfig = {
                Jwks: config.TestAdr.Jwks,
                mtls: config.mtls,
                RegisterBaseUris: {
                    Oidc: "https://api.int.cdr.gov.au/idp",
                    Resource: "https://api.int.cdr.gov.au/cdr-register",
                    SecureResource: "https://secure.api.int.cdr.gov.au/cdr-register"
                },
                AdrClients: <any>undefined,
                DataRecipientApplication: <any>{
                    BrandId: config.TestAdr.BrandId,
                    ProductId: config.TestAdr.ProductId
                }
            };
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
