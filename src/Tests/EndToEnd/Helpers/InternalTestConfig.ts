import { EndToEndTestingConfig } from "../Environments";
import { GenerateDrJwks, GenerateRegisterJwks, GenerateDhJwks } from "../../../Common/Init/Jwks";
import { E2ETestEnvironment } from "../Framework/E2ETestEnvironment";
import { TestDataRecipientApplication } from "../../../MockServices/Register/MockData/DataRecipients";
import _ from "lodash"
import { TestPKI } from "./PKI";
import { MockSoftwareProductConfig } from "../../../MockServices/SoftwareProduct/Server/Config";
import { AdrConnectivityConfig } from "../../../Common/Config";

const getPort = require('get-port')

const onceCache:{id:any,result:any}[] = []

const DoOnce = <T>(fn:() => T) => {
    let match:{id:any,result:any}|undefined = _.find(onceCache,x => x.id == fn)
    if (match) return match.result;

    let result = fn();
    onceCache.push({id:fn,result})
    return result;
}

TestPKI.TestConfig()

const TestAdrConnectivityConfig = async (env:E2ETestEnvironment):Promise<AdrConnectivityConfig> => ({
    Jwks: `http://localhost:${env.TestServices.adrJwks.port}/private.jwks`,
    LegalEntityId: TestDataRecipientApplication.LegalEntityId,
    BrandId: TestDataRecipientApplication.BrandId,
    RegisterBaseUris: {
        Oidc: env.SystemUnderTest.Register().DiscoveryUri,
        Resource: env.SystemUnderTest.Register().PublicUri,
        SecureResource: env.SystemUnderTest.Register().SecureUri
    },
    SoftwareProductConfigUris: {
        sandbox: `http://localhost:${env.TestServices.softwareProduct.port}/software.product.config`
    },
    mtls: {
        key: (await TestPKI.TestConfig()).client.key,
        cert: (await TestPKI.TestConfig()).client.certChain,
        ca: (await TestPKI.TestConfig()).caCert
    }

})

export class InternalTestConfig {
    static Configure = () => {
        const config:EndToEndTestingConfig = {
            Name:"Mock test environment",
            EvidenceDir: process.env.MOCK_EVIDENCE_OUT,
            TestData:{
                Personas: {
                    Jane: {
                        InvalidAccountId: 'account-78'
                    },
                    Donna: {
                        NonConsentedAccountId: 'account-5' // TS_245
                    },
                    Joseph: {
                        NonConsentedAccountId: 'non-consented-account-5' // TS_245
                    }
                }
            },
            Automation: {
                Puppeteer: {
                    Identifiers: {
                        auth: {
                            waitSelectors: ['false'],
                            id: 'false',
                            id_button: 'false'
                        },
                        accounts: {
                            waitSelectors: ['false'],
                            all_accounts: 'false',
                            select_accounts_next_button: 'false'
                        },
                        otp: {
                            otp: 'false',
                            otp_button: 'false',
                            waitSelectors: ['false']
                        },
                        confirmSharing: {
                            waitSelectors: [`document.querySelector('input[type="submit"]')`],
                            button: `document.querySelector('input[type="submit"]')`
                        },
                        unredirectableMatch: {
                            waitSelectors: [`document.body.innerText == '{"errors":[{"msg":"Invalid value","param":"request","location":"query"}]}'`]
                        }
                    }
                }
            },
            SystemUnderTest: {
                Register: (env:E2ETestEnvironment) => ({
                    DiscoveryUri: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}/oidc`,
                    SecureUri: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}`,
                    PublicUri: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}`
                }),
                AdrGateway: (env:E2ETestEnvironment) => ({
                    BackendUrl: `https://localhost:${env.TestServices.httpsProxy?.adrGateway?.port}`,
                    FrontEndUrls: {
                        JWKSEndpoint: `https://localhost:${env.TestServices.httpsProxy?.adrServer?.port}/jwks`,
                        RevocationEndpoint: `https://localhost:${env.TestServices.httpsProxy?.adrServer?.port}/revoke`
                    }
                }),
                Dataholder: "test-data-holder-1"
            },
            TestServiceDefinitions: { // Service Definition paramaterized by 
                // AdrGateway: true,
                AdrServer: async (env) => (_.merge({
                    Port: await getPort(),
                    SecurityProfile: {
                        JoseApplicationBaseUrl: `https://localhost:${env.TestServices.httpsProxy?.adrServer?.port}`,
                        AudienceRewriteRules: {'/revoke':'/revoke'}
                    }
                },await TestAdrConnectivityConfig(env))),
                MockDhServer: async (env) => ({
                    FrontEndUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/`,
                    FrontEndMtlsUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/`,
                    AuthorizeUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/authorize`,
                    Jwks: DoOnce(GenerateDhJwks).toJWKS(true),
                    mtls: {
                        key: (await TestPKI.TestConfig()).client.key,
                        cert: (await TestPKI.TestConfig()).client.certChain,
                        ca: (await TestPKI.TestConfig()).caCert
                    },
                    RegisterJwksUri: `http://localhost:${env.TestServices.mockRegister?.port}/oidc/jwks`,
                    Port: await getPort(),
                    SecurityProfile: {
                        ClientCertificates: {
                            Headers:{
                                ThumbprintHeader: "x-cdrgw-cert-thumbprint"
                            },
                        },
                        JoseApplicationBaseUrl: "https://cdr-dr.regaustbank.io",
                        AudienceRewriteRules: {
                            "/revoke":"/affordability/security/revoke"
                        }
                    },
                    oidcConfiguration: {
                        "authorization_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/authorize`,
                        "token_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/idp/token`,
                        "introspection_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/idp/token/introspect`,
                        "revocation_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/idp/token/revoke`,
                        "userinfo_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/userinfo`,
                        "registration_endpoint": `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/idp/register`,
                        "jwks_uri": `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/jwks`,
                    }
                }),
                MockRegister: async (env) => ({
                    Port: await getPort(),
                    Jwks: GenerateRegisterJwks().toJWKS(true),
                    FrontEndUrl: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}/`,
                    FrontEndMtlsUrl: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}/`,
                    TestDataHolders: {
                        "test-data-holder-1":`https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/mock.register.config`
                    },
                    TestDataRecipientJwksUri: `http://localhost:${env.TestServices.adrServer?.port}/`,
                    LiveRegisterProxy: {
                        Jwks: (await env.GetServiceDefinition.Connectivity()).Jwks,
                        BrandId: undefined,
                        LegalEntityId: undefined,
                        SoftwareProductConfigUris: {
                            sandbox: `http://localhost:${env.TestServices.softwareProduct.port}/software.product.config`
                        },
                        RegisterBaseUris: {
                            Oidc: "https://api.int.cdr.gov.au/idp",
                            Resource: "https://api.int.cdr.gov.au/cdr-register",
                            SecureResource: "https://secure.api.int.cdr.gov.au/cdr-register",
                        }
                    }
                }),
                SoftwareProduct: async (env) => {
                    let softwareProductConfig:MockSoftwareProductConfig = {
                        Port: await getPort(),
                        ProductId: TestDataRecipientApplication.ProductId,
                        redirect_uris: ["https://regaustbank.io","https://regaustbank.io/redirect2"],
                        standardsVersion: 1,
                        standardsVersionMinimum: 1,
                        uris: {
                            jwks_uri: `https://localhost:${env.TestServices.httpsProxy?.adrServer?.port}/jwks`,
                            logo_uri: `http://regaustbank.io`,
                            policy_uri: `http://regaustbank.io`,
                            revocation_uri: `https://localhost:${env.TestServices.httpsProxy?.adrServer?.port}/revoke`,
                            tos_uri: `http://regaustbank.io`
                        }
                    }
                    return softwareProductConfig;
                },
                AdrJwks: async (env) => {
                    return {
                        Port: await getPort(),
                        Jwks: GenerateDrJwks().toJWKS(true),
                    }
                },
                AdrGateway: async (env) => ({
                    Port: await getPort(),
                    BackEndBaseUri: env.SystemUnderTest.AdrGateway().BackendUrl,
                }),
                Connectivity: async (env) => (await TestAdrConnectivityConfig(env)),
                TestHttpsProxy:true,
                AdrDb: true
            }
        }
        return config;
    }
}
