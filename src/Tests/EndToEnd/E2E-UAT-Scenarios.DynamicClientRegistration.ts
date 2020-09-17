import { Scenario as ScenarioBase, TestContext, HttpLogEntry } from "./Framework/TestContext";
import { expect } from "chai";
import _ from "lodash"
import { SetValue } from "./Framework/SetValue";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import { DataHolderRegistration } from "../../Common/Entities/DataHolderRegistration";
import { JWT } from "jose";
import urljoin from "url-join";
import { AdrConnectivityConfig } from "../../Common/Config";
import { axios } from "../../Common/Axios/axios";
import moment from "moment";
import { SwitchIdTokenAlgs } from "./Helpers/SwitchIdTokenAlgs";
import { UpdateRegistrationAtDataholder } from "../../Common/Connectivity/Evaluators/DynamicClientRegistration";
import { logger } from "../Logger";

export const DcrSymbols = {
    Context: {
        ClientRegistration: Symbol.for("ClientRegistration"),
        ClientRegistrationCreated: Symbol.for("ClientRegistrationCreated"),
        DCRAccessToken: Symbol.for("DCRAccessToken"),
        TS_085: Symbol.for("TS_085"),
        CurrentRegistrationAtDh: Symbol.for("CurrentRegistrationAtDh")
    },
    Values: {
    }
}

const GetRegistrationPropertiesExpectations = (statusCode:number,registrationHttp: HttpLogEntry) => {

    let responseData = registrationHttp.response?.data;
    if (!responseData) throw 'No response data';

    let keys = Object.keys(responseData)

    // test case prepared
    expect(registrationHttp.response?.status).to.equal(statusCode);
    expect(responseData.client_id).to.be.a('string');

    //optional
    if (_.find(keys,k => k == 'client_id_issued_at')) {
        expect(responseData.client_id_issued_at).to.be.a('number');
    }
    if (_.find(keys,k => k == 'application_type')) {
        expect(responseData.application_type).to.equal("web");
    }

    expect(responseData.token_endpoint_auth_method).to.equal("private_key_jwt");
    
    expect(responseData.token_endpoint_auth_signing_alg).to.equal("PS256");

    // As specified (https://github.com/cdr-register/register/issues/54
    const missingGrantTypes = _.difference(["client_credentials","authorization_code","refresh_token"], responseData.grant_types)
    expect(missingGrantTypes.length).to.eq(0);
    expect(JSON.stringify(responseData.response_types)).to.equal(JSON.stringify(["code id_token"]));


    if (_.find(keys,k => k == 'id_token_signed_response_alg')) {
        expect(responseData.id_token_signed_response_alg).to.equal("PS256");
    }

}

const UpdateRegistrationPropertiesExpectations = (statusCode:number,registrationHttp: HttpLogEntry) => {
    let requestJwt = registrationHttp.config.data;
    let requestParts = <any>JWT.decode(requestJwt)

    let ssa = <any>JWT.decode(requestParts.software_statement)

    let responseData = registrationHttp.response?.data;
    if (!responseData) throw 'No response data';

    let keys = Object.keys(responseData)

    // test case prepared
    expect(registrationHttp.response?.status).to.equal(statusCode);
    expect(responseData.client_id).to.be.a('string');

    //optional
    if (_.find(keys,k => k == 'client_id_issued_at')) {
        expect(responseData.client_id_issued_at).to.be.a('number');
    }
    expect(responseData.client_name).to.equal(ssa.client_name);
    expect(responseData.client_description).to.equal(ssa.client_description);
    expect(responseData.client_uri).to.equal(ssa.client_uri);

    if (_.find(keys,k => k == 'application_type')) {
        expect(responseData.application_type).to.equal("web");
    }

    // test case unprepared
    expect(responseData.org_id).to.equal(ssa.org_id);
    expect(responseData.org_name).to.equal(ssa.org_name);
    expect(JSON.stringify(responseData.redirect_uris)).to.equal(JSON.stringify(ssa.redirect_uris));
    expect(responseData.logo_uri).to.equal(ssa.logo_uri);
    expect(responseData.tos_uri).to.equal(ssa.tos_uri);

    expect(responseData.policy_uri).to.equal(ssa.policy_uri);

    expect(responseData.jwks_uri).to.equal(ssa.jwks_uri);

    expect(responseData.revocation_uri).to.equal(ssa.revocation_uri);

    expect(responseData.token_endpoint_auth_method).to.equal("private_key_jwt");
    
    expect(responseData.token_endpoint_auth_signing_alg).to.equal("PS256");

    // As specified (https://github.com/cdr-register/register/issues/54
    const missingGrantTypes = _.difference(["client_credentials","authorization_code","refresh_token"], responseData.grant_types)
    expect(missingGrantTypes.length).to.eq(0);
    expect(JSON.stringify(responseData.response_types)).to.equal(JSON.stringify(["code id_token"]));


    if (_.find(keys,k => k == 'id_token_signed_response_alg')) {
        expect(responseData.id_token_signed_response_alg).to.equal("PS256");
    }

    expect(responseData.id_token_encrypted_response_alg).to.equal(requestParts.id_token_encrypted_response_alg);
    expect(responseData.id_token_encrypted_response_enc).to.equal(requestParts.id_token_encrypted_response_enc);

    if (_.find(keys,k => k == 'request_object_signing_alg')) {
        expect(responseData.request_object_signing_alg).to.equal(requestParts.request_object_signing_alg);
    }

    expect(responseData.software_statement).to.equal(requestParts.software_statement);
    expect(responseData.software_id).to.equal(ssa.software_id);
    expect(responseData.scope).to.equal(ssa.scope);

}

export const Tests = ((environment:E2ETestEnvironment) => {

    function Scenario(testFnDefiner: (testDefFn:(scenarioId:string) => [string,() => Promise<any>]) => Mocha.Test, persona: string | undefined, description?: string | undefined) {
        return ScenarioBase(testFnDefiner,persona,environment,description)
    }


    describe('Dynamic client registration', async () => {

        Scenario($ => it.apply(this,$('Validate OpenID at Dataholder')), undefined, 'Validate OpenID Provider Configuration End Point.')
            .Given('Cold start')
            .When(SetValue,async (ctx) => await environment.TestServices.adrGateway?.connectivity.DataHolderOidc(environment.Config.SystemUnderTest.Dataholder).Evaluate({ignoreCache:"all"}),"oidc")
            .Then(async ctx => {
                await ctx.GetResult(SetValue,"oidc");
                let registrationHttpRequest = ctx.GetLastHttpRequest("GET",/\.well-known\/openid-configuration$/);

                expect(registrationHttpRequest.response?.status).to.equal(200);
            })


        Scenario($ => it.apply(this,$('Get clientID')), undefined, 'Detemine if a client ID exists for given dataholder')
            .Given('Cold start')
            .When(SetValue,async (ctx) => {
                let regManager = environment.TestServices.adrGateway?.connectivity.dataholderRegistrationManager;
                if (typeof regManager == 'undefined') throw 'Registration manager is undefined';
                let adrConfig = (await environment.GetServiceDefinition.AdrGateway());
                let dataholderId = environment.Config.SystemUnderTest.Dataholder;
                let reg = await regManager.GetActiveRegistrationByIds((await ctx.environment.OnlySoftwareProductConfig()).ProductId,dataholderId)
                return reg;
            },"Registration")
            .Then(async ctx => {
                let reg:DataHolderRegistration = await ctx.GetValue("Registration")
                logger.debug(reg?.clientId);
            }).Keep(DcrSymbols.Context.ClientRegistration)

        Scenario($ => it.apply(this,$('Get token')), undefined, 'Get Token for DCR (existing client)')
            .Given('Cold start')
            .Precondition("ClientID exist",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {
                let reg:DataHolderRegistration = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration");
                let at = await environment.TestServices.adrGateway?.connectivity.DhRegAccessToken(await ctx.environment.OnlySoftwareProduct(),reg.dataholderBrandId).Evaluate()
                return at;
            },"Token")
            .Then(async ctx => {
                let reg:DataHolderRegistration = await ctx.GetValue("Token")
                logger.debug(reg.clientId);
            }).Keep(DcrSymbols.Context.DCRAccessToken)

        Scenario($ => it.apply(this,$('Get current registration')), undefined, 'Get current registration (existing client)')
            .Given('Cold start')
            .Precondition("ClientID exists",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {
                let reg:DataHolderRegistration = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration");
                let updatedReg = await environment.TestServices.adrGateway?.connectivity.CheckAndUpdateClientRegistration(await ctx.environment.OnlySoftwareProduct(),reg.dataholderBrandId).Evaluate()
                return updatedReg;
            },"UpdatedRegistration")
            .Then(async ctx => {
                let result:DataHolderRegistration = (await ctx.GetResult(SetValue,"UpdatedRegistration")).value
                logger.debug(result);
            })

        Scenario($ => it.apply(this,$('TS_084')), undefined, 'redirect_uris must be a subset of those in the SSA')
            .Given('Cold start')
            .Precondition("Client ID does not exist",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg !== 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'

                // add a new redirectUrl
                let softwareProductConfigFn = environment.GetServiceDefinition.SoftwareProduct;

                environment.GetServiceDefinition.SoftwareProduct = async () => {
                    let orig = await softwareProductConfigFn();
                    orig = _.cloneDeep(orig);
                    orig.redirect_uris.push(urljoin(orig.redirect_uris[0],"unregistered-path"));
                    return orig;
                }

                // Create a new registration using the Connector
                const dataholder = environment.Config.SystemUnderTest.Dataholder;
                logger.debug(`Test new client registration with dataholder ${dataholder}`)

                // Expect the NewClientRegistration to be evaluated
                let productId = (await ctx.environment.OnlySoftwareProduct());
                let dependency = environment.TestServices.adrGateway.connectivity.DhNewClientRegistration(productId,dataholder);

                try {
                    await dependency.Evaluate({ignoreCache:"all"});
                } catch (e) {
                    e
                } finally {
                    // reinstate the original evaluator
                    environment.GetServiceDefinition.SoftwareProduct = softwareProductConfigFn
                }

            },"NewRegistrationExecution")
            .Then(async ctx => {

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("POST",/register$/);

                expect(registrationHttpRequest.response?.status).to.equal(400);

            },300)

        Scenario($ => it.apply(this,$('TS_083')).timeout(300000), undefined, 'New registration with correct claims')
            .Given('Cold start')
            .Precondition("Client ID does not exist",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg !== 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'
                // Create a new registration using the Connector
                const dataholder = environment.Config.SystemUnderTest.Dataholder;
                logger.debug(`Test new client registration with dataholder ${dataholder}`)

                // Expect the NewClientRegistration to be evaluated
                let dependency = environment.TestServices.adrGateway.connectivity.DhNewClientRegistration((await ctx.environment.OnlySoftwareProduct()),dataholder);

                try {
                    await dependency.Evaluate({ignoreCache:"all"});
                } catch (e) {
                    throw 'Client registration failed unexpectedly'
                }

            },"NewRegistrationExecution")
            .Then(async ctx => {
                await ctx.GetValue("NewRegistrationExecution")

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("POST",/register$/);
                if (registrationHttpRequest.error) {
                    throw registrationHttpRequest.error
                }

            },300).Keep(DcrSymbols.Context.ClientRegistrationCreated)

        Scenario($ => it.apply(this,$('TS_085')), undefined, 'On success an HTTP status code of 201-Created along with the Client ID should be issued back to the DR .Also all the registered metadata about this client MUST be returned by the DH authorisation server.')
            .Given('Cold start')
            .Precondition("Client ID does not exist",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg !== 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {
                return ctx.GetTestContext(DcrSymbols.Context.ClientRegistrationCreated).GetValue("NewRegistrationExecution")
            },"NewRegistrationExecution")
            .Then(async ctx => {
                let createRegistrationCtx = ctx.GetTestContext(DcrSymbols.Context.ClientRegistrationCreated)

                let registrationHttpRequest = createRegistrationCtx.GetOnlyHttpRequest("POST",/register$/);

                UpdateRegistrationPropertiesExpectations(201,registrationHttpRequest);

            },300).Keep(DcrSymbols.Context.TS_085)

        Scenario($ => it.apply(this,$('TS_100')), undefined, 'The required claims MUST be received by the DR after successful DCR process.')
            .Given('Cold start')
            .Proxy(DcrSymbols.Context.TS_085)

        Scenario($ => it.apply(this,$('TS_086')), undefined, 'Get an existing registration from a dataholder')
            .Given('Cold start')
            .Precondition("Client ID exists",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'
                // Create a new registration using the Connector
                const dataholder = environment.Config.SystemUnderTest.Dataholder;
                logger.debug(`Test new client registration with dataholder ${dataholder}`)

                let dependency = environment.TestServices.adrGateway?.connectivity.CheckAndUpdateClientRegistration(await ctx.environment.OnlySoftwareProduct(),dataholder);
                await dependency.Evaluate()
            },"ExistingRegistrationExecution")
            .Then(async ctx => {

                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration");
                if (!reg) throw 'DataHolderRegistration is not truthy';

                await ctx.GetValue("ExistingRegistrationExecution")

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("GET",/register\/[^\/]+$/);

                GetRegistrationPropertiesExpectations(200,registrationHttpRequest);

            },300).Keep(DcrSymbols.Context.CurrentRegistrationAtDh)

        Scenario($ => it.apply(this,$('TS_087')), undefined, 'Update a registration by changing the id_token_encrypted_response_enc')
            .Given('Cold start')
            .Precondition("Client ID exists",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {
                let original_id_token_encrypted_response_alg:string|undefined = await SwitchIdTokenAlgs(environment)

                return original_id_token_encrypted_response_alg;
            },"original_id_token_encrypted_response_alg")
            .Then(async ctx => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration");
                if (!reg) throw 'DataHolderRegistration is not truthy';

                let original_id_token_encrypted_response_alg:string = await ctx.GetValue("original_id_token_encrypted_response_alg");

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("PUT",/register\/[^\/]+$/);

                UpdateRegistrationPropertiesExpectations(200,registrationHttpRequest);

                expect(registrationHttpRequest.response?.data.id_token_encrypted_response_alg).to.not.equal(original_id_token_encrypted_response_alg);
                logger.debug(`Successfully changed id_token_encrypted_response_alg from ${original_id_token_encrypted_response_alg} to ${registrationHttpRequest.response?.data.id_token_encrypted_response_alg}`)

            },300)

        Scenario($ => it.apply(this,$('TS_089')), undefined, 'DR sends a Get/Update/Delete request to the DH with an invalid access token.')
            .Given('Existing client ID')
            .Precondition("Client ID exists",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'
                // Create a new registration using the Connector
                const dataholder = environment.Config.SystemUnderTest.Dataholder;
                logger.debug(`Test new client registration with dataholder ${dataholder}`)

                let interceptor = axios.interceptors.request.use(config => {
                    if (config.method == "get" && config.url && /register\/[^\/]+$/.test(config.url)) {
                        config.headers['Authorization'] = 'Bearer invalidtokenthisis'
                    }
                    return config;
                })

                try {
                    let dependency = environment.TestServices.adrGateway?.connectivity.CheckAndUpdateClientRegistration(await ctx.environment.OnlySoftwareProduct(),dataholder);
                
                    await dependency.Evaluate()
                } catch (err) {
                    if (!err.response) throw err;
                } finally {
                    axios.interceptors.request.eject(interceptor)
                }

            },"ExistingRegistrationExecution")
            .Then(async ctx => {

                let reg:DataHolderRegistration|undefined = await ctx.GetValue("ExistingRegistrationExecution");

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("GET",/register\/[^\/]+$/);

                expect(registrationHttpRequest.response?.status).to.equal(401);

            },300)
            
        Scenario($ => it.apply(this,$('TS_090')), undefined, 'DR sends a Get/Update/Delete request to the DH with an invalid client id.')
            .Given('Existing client ID')
            .Precondition("Client ID exists",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'
                // Create a new registration using the Connector
                const dataholder = environment.Config.SystemUnderTest.Dataholder;
                logger.debug(`Test new client registration with dataholder ${dataholder}`)

                let interceptor = axios.interceptors.request.use(config => {
                    if (config.method == "get" && config.url) {
                        let m = /^(.*?)register\/([^\/]+$)/.exec(config.url)
                        if (m) {
                            config.url = `${m[1]}register/invalid-client-id`
                        }
                    }
                    return config;
                })

                try {
                    let dependency = environment.TestServices.adrGateway?.connectivity.CheckAndUpdateClientRegistration(await ctx.environment.OnlySoftwareProduct(),dataholder);
                
                    await dependency.Evaluate()
                } catch (err) {
                    if (!err.response) throw err;
                } finally {
                    axios.interceptors.request.eject(interceptor)
                }

            },"ExistingRegistrationExecution")
            .Then(async ctx => {

                let reg:DataHolderRegistration|undefined = await ctx.GetValue("ExistingRegistrationExecution");

                let registrationHttpRequest = ctx.GetOnlyHttpRequest("GET",/register\/[^\/]+$/);

                expect(registrationHttpRequest.response?.status).to.equal(401);

            },300)
            
        Scenario($ => it.apply(this,$('TS_094')), undefined, 'DH rejects registration request for invalid client metadata.')
            .Given('the value of one of the client metadata fields is invalid')
            .Precondition("Client ID determined",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }
            })
            .When(SetValue,async (ctx) => {

                let configFn = environment.TestServices.adrGateway.connectivity.configFn;

                try {
                    environment.TestServices.adrGateway.connectivity.configFn = async ():Promise<AdrConnectivityConfig> => {
                        let origConfig = _.clone(await configFn());
                
                        return {
                            BrandId: origConfig.BrandId,
                            LegalEntityId: origConfig.LegalEntityId,
                            SoftwareProductConfigUris: origConfig.SoftwareProductConfigUris,
                            DefaultClaims: origConfig.DefaultClaims,
                            UsePushedAuthorizationRequest: origConfig.UsePushedAuthorizationRequest,
                            UseDhArrangementEndpoint: origConfig.UseDhArrangementEndpoint,
                            CheckDataholderStatusEndpoint: origConfig.CheckDataholderStatusEndpoint,
                            Database: origConfig.Database,                            
                            RegisterBaseUris: origConfig.RegisterBaseUris,
                            Jwks: origConfig.Jwks,
                            mtls: origConfig.mtls,
                            Crypto: {
                                IDTokenSignedResponseAlg: "RS256"
                            }
                        }
                    }
    
                    let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                    if (!reg) throw 'Asserting that reg is not undefined'
                    let dataholder = environment.Config.SystemUnderTest.Dataholder;
                    let pw = environment.TestServices.adrGateway?.connectivity;
                    if (!pw) throw 'Asserting that pw is not undefined'
                    
                    let productKey = await ctx.environment.OnlySoftwareProduct();
                    let productConfig = await ctx.environment.OnlySoftwareProductConfig();
                    let dhOidc = await pw.DataHolderOidc(dataholder).Evaluate();
                    let jwks = await pw.DataRecipientJwks().Evaluate();
                    let config = await pw.AdrConnectivityConfig().Evaluate();
                    let accessToken = await pw.DhRegAccessToken(productKey,dataholder).Evaluate();
                    let ssa = await pw.SoftwareStatementAssertion(productKey).Evaluate();
    
                    //reg?.clientId,ssa,dhOidc,config,productConfig,jwks,accessToken,pw.cert
                    await UpdateRegistrationAtDataholder(pw.cert,{
                        AdrConnectivityConfig: config,
                        BootstrapClientRegistration: reg,
                        DataHolderOidc: dhOidc,
                        DataRecipientJwks: jwks,
                        DhRegAccessToken: accessToken,
                        SoftwareProductConfig: productConfig,
                        SoftwareStatementAssertion: ssa
                    }).catch(err => {
                        
                    });
    
                } finally {
                    environment.TestServices.adrGateway.connectivity.configFn = configFn
                }
                return;
            },"UpdateExecution")
            .Then(async ctx => {
                await ctx.GetValue("UpdateExecution");
                let registrationHttpRequest = ctx.GetOnlyHttpRequest("PUT",/register\/[^\/]+$/);

                expect([401,400]).to.include(registrationHttpRequest.response?.status);

            },300)
        Scenario($ => it.apply(this,$('TS_095')), undefined, 'DR sends an expired SSA.')
            .Given('Existing client ID')
            .Precondition("Client ID determined and SSA is expired",async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (typeof reg == 'undefined') {
                    throw 'Cannot proceed'
                }

                let old_ssa:string;

                try {
                    old_ssa = await environment.GetPersistedValue("Old SSA")
                } catch (e) {
                    logger.debug("Getting an SSA")
                    let ssa = await environment.TestServices.adrGateway?.connectivity.SoftwareStatementAssertion(await ctx.environment.OnlySoftwareProduct()).Evaluate({ignoreCache:"all"})
                    if (!ssa) throw 'Failed to get an SSA'
                    await environment.PersistValue("Old SSA",ssa);
                    logger.debug(`Received SSA: ${ssa}`);
                    throw 'Waiting for the SSA to expire'
                }

                let parts = <any>JWT.decode(old_ssa,{complete:true});
                let now = moment.utc();
                let testTime = moment.utc(parts.payload.exp*1000).add(30,'seconds')
                if (now.isAfter(testTime)) {
                    logger.debug("SSA has expired. Proceeding to test")
                } else {
                    let diff = now.diff(testTime,"second");
                    throw `SSA is not yet expired. Test can start in ${diff} seconds.`
                }

            })
            .When(SetValue,async (ctx) => {
                let reg:DataHolderRegistration|undefined = await ctx.GetTestContext(DcrSymbols.Context.ClientRegistration).GetValue("Registration")
                if (!reg) throw 'Asserting that reg is not undefined'
                let old_ssa = await environment.GetPersistedValue("Old SSA");
                let dataholder = environment.Config.SystemUnderTest.Dataholder;
                let pw = environment.TestServices.adrGateway?.connectivity;
                if (!pw) throw 'Asserting that pw is not undefined'
                let DataHolderOidc = await pw.DataHolderOidc(dataholder).Evaluate();
                let DataRecipientJwks = await pw.DataRecipientJwks().Evaluate();
                let AdrConnectivityConfig = await pw.AdrConnectivityConfig().Evaluate();
                let productKey = await ctx.environment.OnlySoftwareProduct();
                let SoftwareProductConfig = await ctx.environment.OnlySoftwareProductConfig();

                let DhRegAccessToken = await pw.DhRegAccessToken(productKey,dataholder).Evaluate();
                logger.debug(`Expired SSA: ${old_ssa}`);

                //reg?.clientId,old_ssa,dhOidc,config,productConfig,jwks,accessToken,pw.cert

                try {
                    await UpdateRegistrationAtDataholder(pw.cert,{
                        AdrConnectivityConfig,
                        BootstrapClientRegistration: reg,
                        DataHolderOidc,
                        DataRecipientJwks,
                        DhRegAccessToken,
                        SoftwareProductConfig,
                        SoftwareStatementAssertion: old_ssa
                    });
                } catch {
                }

            },"ExpiredSSAExecution")
            .Then(async ctx => {
                await ctx.GetValue("ExpiredSSAExecution");
                let registrationHttpRequest = ctx.GetOnlyHttpRequest("PUT",/register\/[^\/]+$/);

                expect([401,400]).to.include(registrationHttpRequest.response?.status);

            },300)

    })
})