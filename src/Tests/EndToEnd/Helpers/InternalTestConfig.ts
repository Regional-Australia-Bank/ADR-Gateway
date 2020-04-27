import { EndToEndTestingConfig } from "../Environments";
import { GenerateDrJwks, GenerateRegisterJwks, GenerateDhJwks } from "../../../Common/Init/Jwks";
import { E2ETestEnvironment } from "../Framework/E2ETestEnvironment";
import { DataRecipients } from "../../../MockServices/Register/MockData/DataRecipients";
import { DefaultOIDCConfiguration } from "../../../MockServices/DhServer/Server/Config";
import _ from "lodash"
import { TestPKI } from "./PKI";

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
                AdrServer: async (env) => ({
                    Endpoints:{
                        Revocation:"https://localhost:9102/revoke"
                    },
                    Jwks: GenerateDrJwks(),
                    Port: await getPort()
                }),
                MockDhServer: async (env) => ({
                    FrontEndUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/`,
                    FrontEndMtlsUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/`,
                    AuthorizeUrl:  `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/`,
                    Jwks: DoOnce(GenerateDhJwks),
                    RegisterJwksUri: `http://localhost:${env.TestServices.mockRegister?.port}/oidc/jwks`,
                    Port: await getPort(),
                    SecurityProfile: {
                        ClientCertificates: {
                            Headers:{
                                ThumbprintHeader: "x-cdrgw-cert-thumbprint"
                            },
                        },
                        JoseApplicationBaseUrl: "https://register.mocking",
                        AudienceRewriteRules: {
                            "/revoke":"/revoke"
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
                    Jwks: GenerateRegisterJwks(),
                    MockDhBaseUri: `https://localhost:${env.TestServices.httpsProxy?.mockDhServer?.port}/`,
                    MockDhBaseMtlsUri: `https://localhost:${env.TestServices.httpsProxy?.mockDhServerMTLS?.port}/`,
                    Port: await getPort(),
                    FrontEndUrl: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}/`,
                    FrontEndMtlsUrl: `https://localhost:${env.TestServices.httpsProxy?.mockRegister?.port}/`,
                    TestAdr: {
                        Jwks: (await env.GetServiceDefinition.AdrGateway()).Jwks,
                        BrandId: (await env.GetServiceDefinition.AdrGateway()).DataRecipientApplication.BrandId,
                        ProductId: (await env.GetServiceDefinition.AdrGateway()).DataRecipientApplication.ProductId,
                    }
                }),
                AdrGateway: async (env) => ({
                    Jwks: await GenerateDrJwks(),
                    Port: await getPort(),
                    RegisterBaseUris: {
                        Oidc: env.SystemUnderTest.Register().DiscoveryUri,
                        Resource: env.SystemUnderTest.Register().PublicUri,
                        SecureResource: env.SystemUnderTest.Register().SecureUri
                    },
                    DataRecipientApplication: {
                        BrandId: DataRecipients[0].dataRecipientBrands[0].dataRecipientBrandId,
                        LegalEntityId: DataRecipients[0].legalEntityId,
                        ProductId: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].softwareProductId,
                        redirect_uris: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.redirect_uris,
                        standardsVersion: 1,
                        standardsVersionMinimum: 1,
                        uris: {
                            jwks_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.jwks_uri,
                            logo_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].logoUri,
                            policy_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.policy_uri,
                            revocation_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.revocation_uri,
                            tos_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.tos_uri
                        }
                    },
                    AdrClients: [{
                        authCallbackUri:env.SystemUnderTest.AdrGateway().FrontEndUrls.JWKSEndpoint,
                        systemId:"test_ui"
                    }],
                    BackEndBaseUri: env.SystemUnderTest.AdrGateway().BackendUrl,
                    mtls: {
                        key: (await TestPKI.TestConfig()).client.key,
                        cert: (await TestPKI.TestConfig()).client.certChain,
                        ca: (await TestPKI.TestConfig()).caCert
                    }
                }),
                TestHttpsProxy:true,
                // TestHttpsProxy: () => ({

                // }),
                AdrDb: true
            }
        }
        return config;
    }
}
