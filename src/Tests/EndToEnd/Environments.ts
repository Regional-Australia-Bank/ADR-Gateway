import { AdrGatewayConfig } from "../../AdrGateway/Config";
import { ConnectionOptions } from "typeorm";
import { AdrServerConfig } from "../../AdrServer/Server/Config";
import process from "process"
import fs from "fs"
import _ from "lodash"

import { InternalTestConfig } from "./Helpers/InternalTestConfig";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import { DhServerConfig } from "../../MockServices/DhServer/Server/Config";
import { MockRegisterConfig } from "../../MockServices/Register/Server/Config";
import { MockSoftwareProductConfig } from "../../MockServices/SoftwareProduct/Server/Config";
import { AdrJwksConfig } from "../../AdrJwks/Config";
import { AdrConnectivityConfig, MtlsConfig } from "../../Common/Config";
import { logger } from "../Logger";

const path = require('path');

type EnvironmentParameterized<T> = T | ((env:E2ETestEnvironment) => T)
export type ServiceDefinitionParameterized<T> = T | ((env:E2ETestEnvironment) => Promise<T>)

export interface TestBoundaryParams {
    "oldest-time": string // RFC3339
    "newest-time": string // RFC3339
    "min-amount": string
    "max-amount": string
}

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
        SoftwareProduct?: ServiceDefinitionParameterized<MockSoftwareProductConfig>
        AdrJwks?: ServiceDefinitionParameterized<AdrJwksConfig>
        AdrGateway?: ServiceDefinitionParameterized<Partial<Pick<AdrGatewayConfig,"BackEndBaseUri"|"Port">>>
        Connectivity?: ServiceDefinitionParameterized<AdrConnectivityConfig>
        AdrServer?: ServiceDefinitionParameterized<AdrServerConfig>
        TestHttpsProxy?: true
    },
    Automation?: {
        OAuthModule?: string
        PreOtpReceive?: string
        OtpReceive?: string
        Puppeteer?: any
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
        DefaultUsername?: string
        Boundaries?: TestBoundaryParams
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
        logger.warn("Could not change to test config base directory")
    }

    let out = await fn();
    process.chdir(dir)
    return out;
}

export const GetEnvironments = ():{liveTestEnvironments:E2ETestEnvironment[], mockEvironment: E2ETestEnvironment} => {

    let liveTestEnvironments:E2ETestEnvironment[] = []

    const mockEvironment = new E2ETestEnvironment(InternalTestConfig.Configure())

    const currentDir = process.cwd()

    const testConfigBase = process.env.TEST_CONFIG_BASE || TestConfigBase();
    try {
        process.chdir(testConfigBase)
    
        logger.debug(`Looking for test environments in ${testConfigBase}`);
        
        try {
            liveTestEnvironments = _.map(<EndToEndTestingConfig[]><any>JSON.parse(fs.readFileSync(path.join(testConfigBase,"e2e.test.environments.json"),'utf8')),env => {
                return new E2ETestEnvironment(env)
            });
        } catch {
            logger.debug(`Unable to read test environments. Please place JSON array at ${path.join(testConfigBase,"e2e.test.environments.json")}`);       
        }
    
    } catch (e) {
        logger.debug(`Could not change directory to ${testConfigBase}`)
    }

    process.chdir(currentDir)

    return {liveTestEnvironments, mockEvironment}
}