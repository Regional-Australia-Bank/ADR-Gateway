import { singleton } from "tsyringe";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "../../../Common/Entities/JtiLog";
import { ClientJwks } from "../../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../../Common/Entities/MetadataUpdateLog";
import winston from "winston";
import * as Transport from 'winston-transport';
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
import { ClientCertificateInjector, DefaultClientCertificateInjector } from "../../../AdrGateway/Services/ClientCertificateInjection";


export const EntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: "dh_",
  synchronize: true,
  entities: [JtiLog, ClientJwks, MetadataUpdateLog, Consent, ClientRegistration]
};

async function RegisterDependencies(configFn: () => Promise<DhServerConfig>, db?: Promise<Connection>): Promise<void> {

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
    exitOnError: false
  });

  container.registerInstance<() => Promise<JWKS.KeyStore>>("PrivateKeystore", (async (): Promise<JWKS.KeyStore> => {
    return JWKS.asKeyStore((await configFn()).Jwks);

  }))

  container.register("OIDCConfiguration", { useValue: DefaultOIDCConfiguration });
  container.register("Logger", { useValue: logger })

  container.register("TokenIssuerConfig", { useClass: DefaultIssuer })
  container.register("ClientConfigProvider", { useClass: EcosystemClientConfigProvider })
  container.register("EcosystemMetadata", { useClass: DefaultEcosystemMetadata })

  container.register("DhServerConfig", { useValue: configFn })
  container.register("JoseBindingConfig", { useValue: configFn })
  container.register("PaginationConfig", { useValue: configFn })

  const injector = new DefaultClientCertificateInjector(config.mtls);
  container.register("ClientCertificateInjector",{ useValue: injector})

  container.register("OIDCConfigurationPromiseFn", { useValue: async () => DefaultOIDCConfiguration(await configFn()) });

  container.register("IClientCertificateVerifier", { useClass: ThumbprintHeaderClientCertificateVerifier });
  container.register<IClientCertificateVerificationConfig>("IClientCertificateVerificationConfig", {
    useValue: {
      Headers: {
        ThumbprintHeader: "x-cdrgw-cert-thumbprint"
      }
    }
  });

  container.register("CdrRegisterKeystoreProvider", { useValue: GetRegisterJWKS.bind(undefined,configFn,injector) })

  let connection = db || (() => {
    let options = _.merge(EntityDefaults, config.Database, {name: "DhServerDbConnection"});
    return createConnection(options)

  })()

  container.register<Promise<Connection>>(
    "Promise<Connection>",
    {
      useValue: connection
    });

}

export { RegisterDependencies }