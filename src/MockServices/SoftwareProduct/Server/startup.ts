import winston = require("winston");
import { Client, MockSoftwareProduct } from "./server";
import { DefaultClientCertificateInjector, DevClientCertificateInjector, ClientCertificateInjector } from "../../../AdrGateway/Services/ClientCertificateInjection";


import { MockSoftwareProductConfig } from "./Config";

export namespace MockSoftwareProductServerStartup {
    export async function Start(configFn:() => Promise<MockSoftwareProductConfig>) {
        const config = await configFn()

        let port = config.Port;

        let logger = <winston.Logger>winston.createLogger({
            level:"debug",
            transports: [
                new winston.transports.Console({
                    handleExceptions: true,
                    level: "debug"
                })]
            })


        let app = await new MockSoftwareProduct(configFn).init()
        

        return {port, server:app.listen(port, () => {
            logger.info(`mock-software-product started at http://localhost:${port}`);
        })}
    }
}
