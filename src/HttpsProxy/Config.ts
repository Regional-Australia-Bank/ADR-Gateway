import convict = require("convict");
import _ from "lodash"
import { KeyAndCert, TestPKI } from "../Tests/EndToEnd/Helpers/PKI";
import { Dictionary } from "../Common/Server/Types";
import fs from "fs"

export interface ProxySpec {
    target?: number|string,
    listeningPort?: number,
    users?:Dictionary<string>,
    noAuthPattern?: string | RegExp
}

export type MockInfrastructureConfig = {
    Port: number,
    KeyStore?: string,
    ProxyConfig: Dictionary<ProxySpec>;
}

const ProxyConfigFormat = {
    name: 'ProxyConfigFormat',
    validate: (val:MockInfrastructureConfig["ProxyConfig"]) => {
        if (typeof val !== 'object') throw new Error("Proxy configuration must be an object")
        for (let [k,v] of Object.entries(val)) {
            
            if (typeof k !== 'string') throw new Error("Proxy configuration keys must be strings")
            if (typeof v !== 'object') throw new Error("Proxy configuration value must be an object")

            // TODO complete config
        }
    },
    coerce: (s) => {
        return s && JSON.parse(s)
    }
};

convict.addFormat(ProxyConfigFormat)

export const GetConfig = (configFile?:string):MockInfrastructureConfig => {

    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8102,
            env: 'MOCK_INFRASTRUCTURE_PORT'
        },
        ProxyConfig: {
            doc: 'Dictionary of username-password kv-pairs to be used for each service. e.g. {"DhServerPublicProtected": {"users":{"dh-user":"dh_password"},"noAuthPattern":"^(GET|POST) /"}}',
            format: ProxyConfigFormat.name,
            default: {
                AdrGatewayPublicProtected: {
                    users:{ "gateway-user": "gateway-password" },
                    noAuthPattern: /(^OPTIONS )|(^PATCH \/cdr\/consents)/
                },
                DhServerPublicProtected: {
                    users: { "dh-user": "dh-password" },
                    noAuthPattern: /^(GET|POST) \//
                },
                DhServerMtlsPublicProtected: {
                    users: { "dh-user": "dh-password" },
                    noAuthPattern: /^(GET|POST) \//
                }
            },
            env: 'MOCK_INFRASTRUCTURE_PROXY_ROUTES'
        },
        KeyStore: {
            doc: 'File to be used as PKI store',
            format: 'String',
            default: undefined,
            env: 'MOCK_KEYSTORE'
        },
    })

    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}

export type TlsConfig = {
    key: Buffer
    cert: Buffer | Buffer[]
    ca: Buffer
    requestCert: boolean
}

export type TlsServerConfig = {
    server: KeyAndCert;
    caCert: string;
};

export const TlsConfigInit = async (config:MockInfrastructureConfig):Promise<TlsServerConfig> => {
    let tlsCerts:TlsServerConfig;
    
    if (config.KeyStore) {
        try {
            tlsCerts = JSON.parse(fs.readFileSync(config.KeyStore,'ascii'))
            return tlsCerts
        } catch {
        }    
    } else {
        tlsCerts = await TestPKI.TestConfig()
        try {
            fs.writeFileSync(config.KeyStore,tlsCerts)
        } catch {
            
        }
    }
    return tlsCerts
}