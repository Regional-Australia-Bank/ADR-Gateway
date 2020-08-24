import winston = require("winston");
import { MockInfrastructureConfig, TlsConfigInit } from "./Config";
import { SpawnProxies } from "./proxyspec";
import _ from "lodash"

export namespace MockInfrastructureStartup {
  export async function Start (configFn:() => Promise<MockInfrastructureConfig>) {
    const config = await configFn()
  
    let port = config.Port

    let tlsCerts = await TlsConfigInit(config)
  
    let tlsConfig = {
      key: Buffer.from(tlsCerts.server.key),
      cert: _.map(_.flatten([tlsCerts.server.certChain]), c => Buffer.from(c)),
      ca: Buffer.from(tlsCerts.caCert),
      requestCert: false
    }

    let mtlsConfig = {
        key: Buffer.from(tlsCerts.server.key),
        cert: _.map(_.flatten([tlsCerts.server.certChain]), c => Buffer.from(c)),
        ca: Buffer.from(tlsCerts.caCert),
        requestCert: true
    }

    SpawnProxies(config,tlsConfig,mtlsConfig)

  }
}

