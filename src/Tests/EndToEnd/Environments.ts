import { MtlsConfig, AdrGatewayConfig } from "../../AdrGateway/Config";
import { ConnectionOptions, createConnection, Connection, TreeChildren } from "typeorm";
import { AdrServerConfig } from "../../AdrServer/Server/Config";
import { GenerateDrJwks, GenerateRegisterJwks, GetJwks } from "../../Common/Init/Jwks";
import process from "process"
import fs from "fs"
import _ from "lodash"
import { eventNames } from "cluster";

import { InternalTestConfig } from "./Helpers/InternalTestConfig";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import { DhServerConfig } from "../../MockServices/DhServer/Server/Config";
import { MockRegisterConfig } from "../../MockServices/Register/Server/Config";
import { PuppeteerConfig } from "./Helpers/TestDhDataholderConsentConfirmer";

const getPort = require('get-port')

var httpProxy = require('http-proxy');
var path = require('path');

type EnvironmentParameterized<T> = T | ((env:E2ETestEnvironment) => T)
export type ServiceDefinitionParameterized<T> = T | ((env:E2ETestEnvironment) => Promise<T>)

export interface EndToEndTestingConfig {
    Name:string,
    EvidenceDir?:string
    SystemUnderTest:{
        Register: EnvironmentParameterized<{
            DiscoveryUri: string // For token access
            SecureUri: string // For get data holder brands, GetSSA
            PublicUri: string // For Data Recipients, DR status
        }>,
        Dataholder: string // The dataHolderBrandId of the dataholder at the register under test
        AdrGateway: EnvironmentParameterized<{
            BackendUrl: string
            FrontEndUrls: {
                JWKSEndpoint: string
                RevocationEndpoint: string
            }
        }>
    }

    TestServiceDefinitions: {
        MockDhServer?: ServiceDefinitionParameterized<DhServerConfig>,
        MockRegister?: ServiceDefinitionParameterized<MockRegisterConfig>
        AdrDb?: ConnectionOptions | true
        AdrGateway?: ServiceDefinitionParameterized<AdrGatewayConfig>
        AdrServer?: ServiceDefinitionParameterized<AdrServerConfig>
        TestHttpsProxy?: true
    },
    Automation?: {
        PreOtpReceive?: string
        OtpReceive?: string
        Puppeteer: PuppeteerConfig
    },
    TestData?: {
        Personas?: {
            "Jane"?: {
                InvalidAccountId?: string // TS_225
            },
            "Donna"?: {
                NonConsentedAccountId?: string // TS_245
            },
            "Joseph"?: {
                NonConsentedAccountId?: string // TS_245
            }
        },
        DefaultCustomerId?: string,
        MTLS?: {
            invalid?: MtlsConfig
        }
    }
}

export const Deparameterize = <T>(env:E2ETestEnvironment, param:EnvironmentParameterized<T>,filter?:(t:T) => T):T => {
    let Deparameterized:T;
    if (typeof param == 'function') {
        let paramFn = <((env:E2ETestEnvironment) => T)>param;
        Deparameterized = paramFn(env);
    } else {
        Deparameterized = param;
    }
    if (filter) {
        Deparameterized = filter(Deparameterized);
    }
    return Deparameterized
}

export const TestConfigBase = () => {
    return path.join(require('os').homedir(),"cdr-testing");
}

export const InTestConfigBase = async (fn:(() => Promise<any>)) => {
    let dir = process.cwd();

    try {
        process.chdir(TestConfigBase())
    } catch (e) {
        console.warn("Could not change to test config base directory")
    }

    let out = await fn();
    process.chdir(dir)
    return out;
}

export const GetEnvironments = ():E2ETestEnvironment[] => {

    let environments:E2ETestEnvironment[] = []

    const devEvironment = new E2ETestEnvironment(InternalTestConfig.Configure())

    const currentDir = process.cwd()

    const testConfigBase = TestConfigBase();
    try {
        process.chdir(testConfigBase)
    
        console.log(`Looking for test environments in ${testConfigBase}`);
        
        try {
            environments = _.map(<EndToEndTestingConfig[]><any>JSON.parse(fs.readFileSync(path.join(testConfigBase,"e2e.test.environments.json"),'utf8')),env => {
                return new E2ETestEnvironment(env)
            });
        } catch {
            console.log(`Unable to read test environments. Please place JSON array at ${path.join(testConfigBase,"e2e.test.environments.json")}`);       
        }
    
    } catch (e) {
        console.log(`Could not change directory to ${testConfigBase}`)
    }



    process.chdir(currentDir)

    environments.unshift(devEvironment)

    return environments
}