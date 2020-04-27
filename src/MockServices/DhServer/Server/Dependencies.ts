import { singleton } from "tsyringe";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../../Common/Entities/JtiLog";
import { ClientJwks } from "../../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../../Common/Entities/MetadataUpdateLog";
import winston from "winston";
import { ThumbprintHeaderClientCertificateVerifier } from "../../../Common/SecurityProfile/Logic";
import { IClientCertificateVerificationConfig } from "../../../Common/Server/Config";
import { JWKS, JWK } from "jose";
import { Consent } from "../Entities/Consent";
import * as _ from "lodash"
import * as fs from "fs"
import { DefaultOIDCConfiguration, DhServerConfig } from "./Config";
import { container } from "../DhDiContainer";
import { DefaultIssuer } from "./Helpers/TokenConfigProviders";
import { DefaultEcosystemMetadata } from "./Helpers/EcosystemMetadata";
import { EcosystemClientConfigProvider } from "./Helpers/ClientConfigProviders";
import { GetRegisterJWKS } from "./Helpers/GetRegisterJWKS";
import { ClientRegistration } from "../Entities/ClientRegistration";
import { AxiosRequestConfig } from "axios";
import { ClientCertificateInjector } from "../../../AdrGateway/Services/ClientCertificateInjection";
import { GetJwks } from "../../../Common/Init/Jwks";

class DummyClientCertificateInjector implements ClientCertificateInjector {
  inject = (options: AxiosRequestConfig): AxiosRequestConfig => {
    if (typeof options.headers == 'undefined') options.headers = {}
    options.headers["x-cdrgw-cert-commonName"] = "https://example.com"
    options.headers["x-cdrgw-cert-thumbprint"] = "CERT_THUMBPRINT"
    return options;
  }
}

export const EntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: process.env.ENTITY_PREFIX || "dh_",
  synchronize: true,
  entities: [JtiLog, ClientJwks, MetadataUpdateLog, Consent, ClientRegistration]
};

async function RegisterDependencies(configFn: () => Promise<DhServerConfig>, db?: Promise<Connection>): Promise<void> {

  let config = await configFn();

  const logger = winston.createLogger({
    transports: [
      new winston.transports.Console({
        handleExceptions: true
      }),
      new winston.transports.File({ filename: "log.txt" })
    ],
    exitOnError: false
  });

  container.registerInstance<() => Promise<JWKS.KeyStore>>("PrivateKeystore", (async (): Promise<JWKS.KeyStore> => {
    return GetJwks(await configFn());

  }))

  container.register("OIDCConfiguration", { useValue: DefaultOIDCConfiguration });
  container.register("Logger", { useValue: logger })

  container.register("ClientCertificateInjector", { useClass: DummyClientCertificateInjector })

  container.register("TokenIssuerConfig", { useClass: DefaultIssuer })
  container.register("ClientConfigProvider", { useClass: EcosystemClientConfigProvider })
  container.register("EcosystemMetadata", { useClass: DefaultEcosystemMetadata })

  container.register("DhServerConfig", { useValue: configFn })
  container.register("IAppConfig", { useValue: configFn })

  container.register("OIDCConfigurationPromiseFn", { useValue: async () => DefaultOIDCConfiguration(await configFn()) });

  container.register("IClientCertificateVerifier", { useClass: ThumbprintHeaderClientCertificateVerifier });
  container.register<IClientCertificateVerificationConfig>("IClientCertificateVerificationConfig", {
    useValue: {
      Headers: {
        ThumbprintHeader: "x-cdrgw-cert-thumbprint"
      }
    }
  });

  container.register("CdrRegisterKeystoreProvider", { useValue: GetRegisterJWKS.bind(undefined,config.RegisterJwksUri) })

  let connection = db || (() => {
    let options = _.merge(EntityDefaults, config.Database);
    return createConnection(options)

  })()

  container.register<Promise<Connection>>(
    "Promise<Connection>",
    {
      useValue: connection
    });

}

export { RegisterDependencies }