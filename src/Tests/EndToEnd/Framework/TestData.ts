import { JWKS, JWT } from "jose";
import uuid from "uuid";
import moment from "moment";
import _ from "lodash";
import { E2ETestEnvironment } from "./E2ETestEnvironment";
import { GetContextGroup } from "./TestContext";
import { CertsFromFilesOrStrings } from "../../../Common/SecurityProfile/Util";
import { InTestConfigBase } from "../Environments";
/**
 * How to convert pfx to key.pem and cert.pem: https://www.xolphin.com/support/Certificate_conversions/Convert_pfx_file_to_pem_file
 * Will also need to concatenate intermediate certificate with client cert: https://medium.com/@superseb/get-your-certificate-chain-right-4b117a9c0fce
 */

export interface ITestData {
    personas: {
        [key: string]: {accessToken:string}
    },
    dataHolder: DataholderTestingSpec,
    supportedCiphers: string[],
    dataRecipient: {
        jwks: () => Promise<JWKS.KeyStore>,
        clientId: () => Promise<string>,
        authCallbackUri: () => Promise<string>
    },
    cdrRegister: {
        dataRecipientBrandId: string,
        oidcEndpoint: string,
    },
    defaults: {
        consentParams: {
            dataholderBrandId: string 
            cdrScopes: string[],
            userId: string,
            systemId: string,
            sharingDuration: number
        }
    }
}

interface DataholderTestingSpec {
    id: string
    oidcEndpoint: string
    resourceEndpoint: string
    mtlsTestEndpoint: string,
    jwksEndpoint: string,
    tokenEndpoint: string,
    introspectionEndpoint: string
    parEndpoint: string
    revocationEndpoint: string,
    userInfoEndpoint: string,
    authorizeEndpoint: string
    issuer: string
    clientKeyFiles: {valid:ClientCertConfig,invalid:ClientCertConfig}
}

interface ClientCertConfig {
    key:Buffer|Buffer[],
    cert:Buffer|Buffer[],
    passphrase:string
    ca:Buffer|Buffer[],
}

type Unpromisify<T> = T extends Promise<infer U> ? U : T;

const testDataCache:{env:E2ETestEnvironment,data:Unpromisify<ReturnType<typeof GenerateTestDataFromScratch>>}[] = []

export const GenerateTestData = async (env:E2ETestEnvironment) => {
    let cache = _.find(testDataCache, c => c.env === env)
    if (!cache) {
        let data = await GenerateTestDataFromScratch(env);
        testDataCache.push({env,data});
        return data;
    } else {
        return cache.data
    }
}

const GenerateTestDataFromScratch = async (env:E2ETestEnvironment) => {
    const testContext = GetContextGroup(env);

    try {
    
        const dataHolderBrandId = env.Config.SystemUnderTest.Dataholder;

        let dhBrands = await env.TestServices.adrGateway?.connectivity.DataHolderBrands().Evaluate()
        let dhBrandMeta = _.find(dhBrands, b => b.dataHolderBrandId == dataHolderBrandId);

        if (!dhBrandMeta) throw 'No Dh Brands'

        let dhOidc = await env.TestServices.adrGateway?.connectivity.DataHolderOidc(dataHolderBrandId).Evaluate()

        if (!dhOidc) throw 'No Dh Oidc'

        const AdrGatewayConfig = {
            adrGateway: {
                path: `http://localhost:${env.TestServices.adrGateway?.port}`
            },
        }
        
        const validCerts = (await env.GetServiceDefinition.Connectivity()).mtls //await TestPKI.TestConfig()
        const invalidCerts = env.Config.TestData?.MTLS?.invalid //await TestPKI.TestConfig()

        let clientKeyFiles:{valid:ClientCertConfig,invalid:ClientCertConfig};
        try {
            await InTestConfigBase(async () => {
                clientKeyFiles = {
                    valid: {
                        key: CertsFromFilesOrStrings(validCerts.key),
                        cert: CertsFromFilesOrStrings(validCerts.cert),
                        ca: CertsFromFilesOrStrings(validCerts.ca),
                        passphrase: validCerts.passphrase
                    },
                    invalid: invalidCerts && {
                        key: CertsFromFilesOrStrings(invalidCerts.key),
                        cert: CertsFromFilesOrStrings(invalidCerts.cert),
                        ca: CertsFromFilesOrStrings(invalidCerts.ca),
                        passphrase: invalidCerts.passphrase
                    }
                }    
            })
        } catch (e) {
            // TODO use node-forge to create testing certificate
            throw e;
        }

        const connectivityConfig = await env.GetServiceDefinition.Connectivity();
        let dataHolderSpec:DataholderTestingSpec;

        dataHolderSpec = {
            id: dataHolderBrandId,
            oidcEndpoint: dhBrandMeta.endpointDetail.infosecBaseUri,
            authorizeEndpoint: dhOidc.authorization_endpoint,
            introspectionEndpoint: dhOidc.introspection_endpoint,
            parEndpoint: dhOidc.pushed_authorization_request_endpoint,
            issuer: dhOidc.issuer,
            jwksEndpoint: dhOidc.jwks_uri,
            resourceEndpoint: dhBrandMeta.endpointDetail.resourceBaseUri,
            revocationEndpoint: dhOidc.revocation_endpoint,
            userInfoEndpoint: dhOidc.userinfo_endpoint,
            tokenEndpoint: dhOidc.token_endpoint,
            clientKeyFiles: clientKeyFiles,
            mtlsTestEndpoint: dhOidc.revocation_endpoint
        }

        let clientIdPromise:Promise<string>|undefined = undefined;

        const TestData:ITestData = {
            personas: {
                "John":{
                    accessToken: "accesstoken123"
                }
            },
            defaults: {
                consentParams:{
                    cdrScopes: ["bank:accounts.basic:read","common:customer.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: dataHolderBrandId
                }
            },
            cdrRegister: {
                dataRecipientBrandId: connectivityConfig.BrandId,
                oidcEndpoint: connectivityConfig.RegisterBaseUris.Oidc
            },
            dataHolder: dataHolderSpec,
            dataRecipient:{
                clientId: () => {
                    if (clientIdPromise) return clientIdPromise;
                    let dataholder = env.Config.SystemUnderTest.Dataholder;
                    clientIdPromise = (env.OnlySoftwareProduct()).then(softwareProduct => {
                        return env.TestServices.adrGateway!.connectivity.BootstrapClientRegistration(softwareProduct,dataholder).Evaluate().then(reg => reg.clientId)
                    })
                    return clientIdPromise;
                },
                jwks: () => env.GetAdrPrivateJwks(),
                authCallbackUri: async () => Promise.resolve((await env.OnlySoftwareProductConfig()).redirect_uris[0])
        
            },
            supportedCiphers: ["DHE-RSA-AES128-GCM-SHA256","ECDHE-RSA-AES128-GCM-SHA256","DHE-RSA-AES256-GCM-SHA384","ECDHE-RSA-AES256-GCM-SHA384"]
        }
        
        const CreateAssertion = async (endpoint:string) => {
            const clientId = await TestData.dataRecipient.clientId();

            let claims = {
                iss: clientId,
                sub: clientId,
                aud: endpoint,
                jti: uuid.v4(),
                exp: moment.utc().add(30,'s').unix(),
                iat: moment.utc().format()
            }
    
            let jwks = await TestData.dataRecipient.jwks();
            let jwk = jwks.get({use:'sig',alg:"PS256"});
    
            let assertion = JWT.sign(claims,jwk);    

            const params = {
                "client_id":clientId,
                "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": assertion
            }

            return params;
        }
        
        const CreateAssertionWithoutKey = async (endpoint:string, excludedKey:string) => {
            const clientId = await TestData.dataRecipient.clientId();
            const params = {
                "client_id":clientId,
                "client_assertion_type":"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": await CreateAssertionDirty(endpoint,clientId,excludedKey)
            }
            return params;
        }
        
        const CreateAssertionDirty = async (endpoint:string,client_id:string,excludedKey:string):Promise<string> => {
            let claims = {
                iss: client_id,
                sub: client_id,
                aud: endpoint,
                jti: uuid.v4(),
                exp: moment.utc().add(30,'s').unix(), // TODO configuration setting for JWT expiry
                iat: moment.utc().format()
            }
    
            claims = <any>_.omit(claims,excludedKey);
    
            let jwk = (await TestData.dataRecipient.jwks()).get({use:'sig'});
    
            let assertion = JWT.sign(claims,jwk);
    
            return assertion;
        }

        return {
            TestData,
            CreateAssertion,
            CreateAssertionWithoutKey,
            CreateAssertionDirty,
            AdrGatewayConfig
        }
    
    } catch (e) {
        throw 'Could not generate test data'
    }
    
}