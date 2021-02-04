import { Scenario as ScenarioBase, TestContext, HttpLogEntry } from "./Framework/TestContext";
import { DoRequest } from "./Framework/DoRequest";
import { expect } from "chai";
import _ from "lodash"
import { SetValue } from "./Framework/SetValue";
import { CreateAssertion } from "../../Common/Connectivity/Assertions";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import urljoin from "url-join"
import { JWT, JWKS, JWS, JWE } from "jose";
import moment from "moment";
import { GenerateTestData } from "./Framework/TestData";
import { NewGatewayConsent, ExistingCurrentGatewayConsent, GatewayConsentWithCurrentAccessToken, RefreshAccessTokenForConsent} from "./NewGatewayConsent";
import { ConsentRequestLog } from "../../Common/Entities/ConsentRequestLog";
import uuid from "uuid";
import qs from "qs";
import { RegisterSymbols } from "./E2E-UAT-Scenarios.CdrRegister";
import { URL } from "url";
import { DataholderOidcResponse } from "../../Common/Connectivity/Types";
import { ClearDefaultInMemoryCache } from "../../Common/Connectivity/Cache/InMemoryCache";
import { logger } from "../Logger";

const validator = require("validator")

export const SecurityProfileSymbols = {
    Context: {
        OpenIdDiscoveryResponse: Symbol.for("OpenIdDiscoveryResponse"),
        MainAuthorizationFlow: Symbol.for("MainAuthorizationFlow"),
        RefreshAccessToken: Symbol.for("RefreshAccessToken"),
        TS_043: Symbol.for("TS_043"),
        TS_029: Symbol.for("TS_029"),
        TS_032: Symbol.for("TS_032"),
    },
    Values: {
        OpenIdDiscoveryResponse: Symbol.for("OpenIdDiscoveryResponseValue")    
    }
}

export const Tests = ((env:E2ETestEnvironment) => {
    
    function Scenario(testFnDefiner: (testDefFn:(scenarioId:string) => [string,() => Promise<any>]) => Mocha.Test, persona: string | undefined, description?: string | undefined) {
        return ScenarioBase(testFnDefiner,persona,env,description)
    }



    // const {TestData, CreateAssertion, CreateAssertionWithoutKey, AdrGatewayConfig} = await GenerateTestData(env)
    const TestData = async () => (await GenerateTestData(env)).TestData
    const AdrGatewayConfig = async () => (await GenerateTestData(env)).AdrGatewayConfig
    const CreateAssertion = async (...args:any[]) => (await GenerateTestData(env)).CreateAssertion.apply(undefined,<any>args)
    const CreateDhBearerAuthJwt = async (...args:any[]) => (await GenerateTestData(env)).CreateDhBearerAuthJwt.apply(undefined,<any>args)
    const CreateAssertionWithoutKey = async (...args:any[]) => (await GenerateTestData(env)).CreateAssertionWithoutKey.apply(undefined,<any>args)



    describe('Security Profile', async () => {
        
        describe('End Points - OIDC Provider Configuration Endpoint', async () => {

            Scenario($ => it.apply(this,$('TS_050')), undefined, 'Validate OpenID Provider Configuration End Point.')
                .Given('Cold start')
                .When(SetValue,async () => {
                    ClearDefaultInMemoryCache();
                    return await env.TestServices.adrGateway!.connectivity.DataHolderOidc(env.Config.SystemUnderTest.Dataholder).Evaluate({ignoreCache:"all"})
                },SecurityProfileSymbols.Values.OpenIdDiscoveryResponse)
                .Then(async ctx => {
                    let oidcConfig:DataholderOidcResponse = <any>(await (ctx.GetResult(SetValue))).value;
                    logger.debug(oidcConfig);
                    // Expect the result of the "Do/Measure" to error code
                    for (let key of ["issuer","authorization_endpoint","token_endpoint","introspection_endpoint","revocation_endpoint","userinfo_endpoint","registration_endpoint","scopes_supported","response_types_supported","response_modes_supported","grant_types_supported","acr_values_supported","subject_types_supported","id_token_signing_alg_values_supported","request_object_signing_alg_values_supported","token_endpoint_auth_methods_supported","tls_client_certificate_bound_access_tokens","claims_supported"]) {
                        expect(_.keys(oidcConfig)).to.contain(key);
                    }
                    let claims_supported:string[] = (<any>oidcConfig).claims_supported;
                    if (claims_supported.indexOf("vot")>=0) {
                        expect((<any>oidcConfig).vot_values_supported).to.not.be.undefined.and.be.array()
                        expect((<any>oidcConfig).vot_values_supported.length).to.be.greaterThan(3)
                    }
                    // expect ((<any>oidcConfig).introspection_endpoint).to.equal(TestData.dataHolder.introspectionEndpoint);
                    // expect ((<any>oidcConfig).authorization_endpoint).to.equal(TestData.dataHolder.authorizeEndpoint);

                    expect(oidcConfig.id_token_encryption_alg_values_supported).to.satisfy(ms => _.find(ms,m => m == 'RSA-OAEP' || m == 'RSA-OAEP-256'),"One of RSA-OAEP-256 or RSA-OAEP should be supported")
                    expect(oidcConfig.id_token_encryption_enc_values_supported).to.satisfy(ms => _.find(ms,m => m == 'A256GCM' || m == 'A128CBC-HS256'),"One of A256GCM or A128CBC-HS256 should be supported")
                    

                }).Keep(SecurityProfileSymbols.Context.OpenIdDiscoveryResponse)

        })

        describe('End Points - JWKS Endpoint', async () => {

            Scenario($ => it.apply(this,$('TS_052')), undefined, 'The jwks_uri must be provided by the DH and the public keys needs to be made available through the same.')
                .Given('Cold start')
                .PreTask(DoRequest, async ctx => DoRequest.Options({
                    method: "GET",
                    url: (await TestData()).dataHolder.oidcEndpoint+"/.well-known/openid-configuration",
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    responseType:"json"
                }),"oidc")
                .When(DoRequest, async ctx => DoRequest.Options({
                    method: "GET",
                    url: (await ctx.GetResult(DoRequest,"oidc")).body.jwks_uri,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    responseType:"json"
                }),"jwks")
                .Then(async ctx => {
                    expect ((await ctx.GetResult(DoRequest,"oidc")).body.jwks_uri).to.equal((await TestData()).dataHolder.jwksEndpoint);
                    // Expect the result to be a valid keystore
                    expect((async () => (JWKS.asKeyStore((await ctx.GetResult(DoRequest,"jwks")).body)))()).to.be.fulfilled
                })

        })

        describe('Endpoints - Authorization Endpoint', async () => {

            Scenario($ => it.apply(this,$('TS_001')), undefined, 'Verify for OIDC Hybrid Flow a response_type of code id_token SHALL be allowed')
                .Given('Cold start')
                .When(DoRequest,async () => DoRequest.Options({
                    method: "GET",
                    responseType: "json",
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    url: (await TestData()).dataHolder.oidcEndpoint+"/.well-known/openid-configuration"
                }))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let oidcConfig = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    expect(oidcConfig.response_types_supported).to.contain("code id_token");
                })

            // TODO seperate out the scenarios. E.g. Scenario($ => it.apply(this,$('TS_054')),undefined,'Descrioption').SatisfiedBy('TS_054')
            Scenario($ => it.apply(this,$('TS_051')), undefined, 'The Authorization Endpoint MUST be provided and authentication of the enduser should happen successfully based on the parameters provided.')
                .Given('Cold start')
                // TODO change to NewGatewayConsent
                .PreTask(NewGatewayConsent,async (ctx) => {

                    let params = {
                        cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                        sharingDuration: 86400,
                        systemId: "sandbox",
                        userId: "user-12345",
                        dataholderBrandId: (await TestData()).dataHolder.id
                    }            
                    
                    return params;
                })
                .When(SetValue,async ctx => {
                    let consentResult  = (await (ctx.GetResult(NewGatewayConsent)));
                    let id_token = consentResult.oAuthResult.hash?.id_token;
                    if (!id_token) throw 'No id_token'
                    let id_token_claims = JWT.decode(JWE.decrypt(id_token, await env.GetAdrPrivateJwks()).toString('utf8'))
                    return id_token_claims
                },"id_token_claims")
                .Then(async ctx => {
                    let consentResult  = (await (ctx.GetResult(NewGatewayConsent)));
                    let consent = consentResult.consent;
                    let id_token_claims = (await ctx.GetResult(SetValue,"id_token_claims")).value

                    if (typeof consent == 'undefined') throw 'Consent is undefined'
                    expect(consent.ppid).to.not.be.null
                        .and.not.be.undefined
                        .and.not.be.empty;
                    
                    logger.debug('ID Token claims')
                    logger.debug(id_token_claims);
                    expect(consent.IsCurrent()).to.be.true

                    expect(consent.accessToken).to.be.a('string').and.lengthOf.at.least(5);
                    expect(consent.refreshToken).to.be.a('string').and.lengthOf.at.least(5);
                    expect(consent.ExistingClaims().refresh_token_expires_at).to.not.be.undefined.and.not.be.null;


                },240)
                .Keep(SecurityProfileSymbols.Context.MainAuthorizationFlow)     
        })

        describe('Arrangement management', async () => {    
            Scenario($ => it.apply(this,$('Update arrangement')), undefined, 'The cdr_arrangement_id provided in the request object for the first consent must be played back at the token endpoint for the following consent')
                .Given('Cold start')
                // TODO change to NewGatewayConsent
                .PreTask(NewGatewayConsent,async (ctx) => {

                    let params = {
                        cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                        sharingDuration: 86400,
                        systemId: "sandbox",
                        userId: "arrangement-tester",

                        dataholderBrandId: (await TestData()).dataHolder.id
                    }            
                    
                    return params;
                },"firstConsent")
                .PreTask(SetValue,async ctx => {
                    let consentResult  = (await (ctx.GetResult(NewGatewayConsent,"firstConsent")));
                    return consentResult.consent.arrangementId
                },"original_cdr_arrangement_id")
                .When(NewGatewayConsent,async (ctx) => {

                    let params = {
                        cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                        sharingDuration: 86400,
                        systemId: "sandbox",
                        userId: "arrangement-tester",
                        arrangementId: await ctx.GetValue("original_cdr_arrangement_id"),
                        dataholderBrandId: (await TestData()).dataHolder.id
                    }            
                    
                    return params;
                },"secondConsent")
                .Then(async ctx => {
                    let firstConsentResult = (await (ctx.GetResult(NewGatewayConsent,"firstConsent")));
                    let secondConsentResult = (await (ctx.GetResult(NewGatewayConsent,"secondConsent")));
                    expect(firstConsentResult.consent.arrangementId).to.be.a("string").and.not.be.empty;
                    expect(firstConsentResult.consent.arrangementId).to.eq(secondConsentResult.consent.arrangementId)

                },240)

            Scenario($ => it.apply(this,$('DELETE consent')), undefined, 'Delete consent using the Dr. G API (at DH arrangement endpoint)')
                .Given('New Authorization')
                .Precondition("ConnectivityConfig does uses Arrangement Management endpoint", async ctx => {
                    ctx.environment.switches.UseDhArrangementEndpoint = true;
                })
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                // Call introspection endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection1")
                // Revoke the consent
                .PreTask(SetValue, async (ctx) => {

                    let consent = (await ctx.GetResult(NewGatewayConsent)).consent;

                    await ctx.environment.TestServices.adrGateway.connectivity.consentManager.MarkRevoked(consent);

                    await ctx.environment.TestServices.adrGateway.connectivity.PropagateRevokeConsent(consent).GetWithHealing().catch(err => {
                        throw err;
                    });

                    let result = ctx.GetLastHttpRequest("POST",/.*/)
                    return result;
    
                },"Revocation")
                // Call introspection endpoint again and check "active:false"
                .PreTask(DoRequest,async ctx => {

                    // wait 3 seconds before introspections
                    await new Promise(resolve => setTimeout(resolve,3000));

                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection2")
                .When(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.tokenEndpoint,
                        data:qs.stringify(_.merge(
                            {
                                refresh_token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken,
                                grant_type: 'refresh_token'
                            },
                            await CreateAssertion((await TestData()).dataHolder.tokenEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Refresh")
                // Attempt to get a new token and assert that this returns with 401/403
                .Then(async ctx => {
                    let introspection1Result = await ctx.GetResult(DoRequest,"Introspection1");
                    expect(introspection1Result.response.status).to.equal(200);
                    expect(introspection1Result.body.active).to.be.true

                    let revocationResult:HttpLogEntry = (await ctx.GetResult(SetValue,"Revocation")).value
                    expect(revocationResult.config.data).to.match(/cdr_arrangement_id=/);
                    expect(revocationResult.response.status).to.equal(204);

                    let introspection2Result = await ctx.GetResult(DoRequest,"Introspection2")
                    expect(introspection2Result.response.status).to.equal(200);
                    expect(introspection2Result.body.active).to.be.false
                    let refreshResult = await ctx.GetResult(DoRequest,"Refresh")
                    expect(refreshResult.response.status).to.equal(400);
                    expect(refreshResult.body.error).to.equal("invalid_grant");
                },600)

        })

        describe('Endpoints - Token Endpoint', async () => {
            Scenario($ => it.apply(this,$('TS_054')), undefined, 'The Token Endpoint MUST be provided for the client to make a Access Token Request by presenting its Authorization Code. ')
                .Given('New Authorization')
                .When()
                .Then(async ctx => {
                    let consent = (await (ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow).GetResult(NewGatewayConsent))).consent;
                    if (typeof consent == 'undefined') throw 'Consent is undefined'
                    expect(consent.accessToken).to.be.a('string').and.lengthOf.at.least(5);
                },120)

            Scenario($ => it.apply(this,$('Arrangement ID')), undefined, 'The Token Endpoint returns an arrangement id')
                .Given('New Authorization')
                .When()
                .Then(async ctx => {
                    let consent = (await (ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow).GetResult(NewGatewayConsent))).consent;
                    if (typeof consent == 'undefined') throw 'Consent is undefined'
                    expect(consent.arrangementId).to.be.a('string').and.lengthOf.at.least(5);
                },120)


        })


        describe('Endpoints - Revocation Endpoint', async () => {
            Scenario($ => it.apply(this,$('TS_057')), undefined, 'Dataholder OIDC provides a revocation_endpoint')
                .Given('New Authorization')
                .When(SetValue,async ctx => undefined)
                .Then(async ctx => {
                    let oidcConfig = (await ctx.GetTestContext(SecurityProfileSymbols.Context.OpenIdDiscoveryResponse).GetResult(SetValue,SecurityProfileSymbols.Values.OpenIdDiscoveryResponse)).value
                    logger.debug(oidcConfig)
                    expect(oidcConfig.revocation_endpoint).to.satisfy((url) => validator.isURL(url,{require_tld:false}))                        
                    logger.debug(`revocation_endpoint: ${oidcConfig.revocation_endpoint}`)
                },120)

            Scenario($ => it.apply(this,$('TS_058 - Refresh Token')), undefined, 'Dataholder revokes refresh tokens')
                .Given('New Authorization')
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                // Call introspection endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection1")
                // Revoke the consent
                .PreTask(DoRequest, async (ctx) => DoRequest.Options({
                    method: "POST",
                    url: (await TestData()).dataHolder.revocationEndpoint,
                    data:qs.stringify(_.merge(
                        {token:(await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                        await CreateAssertion((await TestData()).dataHolder.revocationEndpoint)
                        // change back to revoation endpoint
                        )),
                    key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                }),"Revocation")
                // Call introspection endpoint again and check "active:false"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection2")
                .When(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.tokenEndpoint,
                        data:qs.stringify(_.merge(
                            {
                                refresh_token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken,
                                grant_type: 'refresh_token'
                            },
                            await CreateAssertion((await TestData()).dataHolder.tokenEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Refresh")
                // Attempt to get a new token and assert that this returns with 401/403
                .Then(async ctx => {
                    let introspection1Result = await ctx.GetResult(DoRequest,"Introspection1");
                    expect(introspection1Result.response.status).to.equal(200);
                    expect(introspection1Result.body.active).to.be.true
                    let revocationResult = await ctx.GetResult(DoRequest,"Revocation")
                    expect(revocationResult.response.status).to.equal(200);
                    let introspection2Result = await ctx.GetResult(DoRequest,"Introspection2")
                    expect(introspection2Result.response.status).to.equal(200);
                    expect(introspection2Result.body.active).to.be.false
                    let refreshResult = await ctx.GetResult(DoRequest,"Refresh")
                    expect(refreshResult.response.status).to.equal(400);
                    expect(refreshResult.body.error).to.equal("invalid_grant");
                },600)

            Scenario($ => it.apply(this,$('DELETE consent')), undefined, 'Delete consent using the Dr. G API')
                .Given('New Authorization')
                .Precondition("ConnectivityConfig does not use Arrangement Management endpoint", async ctx => {
                    ctx.environment.switches.UseDhArrangementEndpoint = false;
                })
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                // Call introspection endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection1")
                // Revoke the consent
                .PreTask(SetValue, async (ctx) => {

                    let consent = (await ctx.GetResult(NewGatewayConsent)).consent;

                    await ctx.environment.TestServices.adrGateway.connectivity.consentManager.MarkRevoked(consent);

                    await ctx.environment.TestServices.adrGateway.connectivity.PropagateRevokeConsent(consent).GetWithHealing().catch(err => {
                        throw err;
                    });

                    let result = ctx.GetLastHttpRequest("POST",/.*/)
                    return result;
    
                },"Revocation")
                // Call introspection endpoint again and check "active:false"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection2")
                .When(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.tokenEndpoint,
                        data:qs.stringify(_.merge(
                            {
                                refresh_token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken,
                                grant_type: 'refresh_token'
                            },
                            await CreateAssertion((await TestData()).dataHolder.tokenEndpoint) // TODO change back to introspection endpoint
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Refresh")
                // Attempt to get a new token and assert that this returns with 401/403
                .Then(async ctx => {
                    let introspection1Result = await ctx.GetResult(DoRequest,"Introspection1");
                    expect(introspection1Result.response.status).to.equal(200);
                    expect(introspection1Result.body.active).to.be.true

                    let revocationResult:HttpLogEntry = (await ctx.GetResult(SetValue,"Revocation")).value
                    expect(revocationResult.config.data).to.match(/token_type_hint=refresh_token&token=/);
                    expect(revocationResult.response.status).to.equal(200);

                    let introspection2Result = await ctx.GetResult(DoRequest,"Introspection2")
                    expect(introspection2Result.response.status).to.equal(200);
                    expect(introspection2Result.body.active).to.be.false
                    let refreshResult = await ctx.GetResult(DoRequest,"Refresh")
                    expect(refreshResult.response.status).to.equal(400);
                    expect(refreshResult.body.error).to.equal("invalid_grant");
                },600)


            Scenario($ => it.apply(this,$('TS_058 - Access Token')), undefined, 'Dataholder revokes access tokens')
                .Given('New Authorization')
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user2",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                // Call userinfo endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "GET",
                        url: (await TestData()).dataHolder.userInfoEndpoint,
                        headers: {
                            Authorization: `Bearer ${(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken}`
                        },
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"
                    })
                    return options
                },"UserInfo1")
                // Revoke the consent
                .PreTask(DoRequest, async (ctx) => DoRequest.Options({
                    method: "POST",
                    url: (await TestData()).dataHolder.revocationEndpoint,
                    data:qs.stringify(_.merge(
                        {token:(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken},
                        await CreateAssertion((await TestData()).dataHolder.revocationEndpoint)
                        // change back to revoation endpoint
                        )),
                    key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                }),"Revocation")
                // Call userinfo endpoint again and check status is 403
                .When(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());

                    // wait 1 seconds for the token to be revoked.
                    await new Promise(resolve => setTimeout(resolve,1000))

                    let options = DoRequest.Options({
                        method: "GET",
                        url: (await TestData()).dataHolder.userInfoEndpoint,
                        headers: {
                            Authorization: `Bearer ${(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken}`
                        },
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"
                    })
                    return options
                },"UserInfo2")
                // Attempt to get a new token and assert that this returns with 401
                .Then(async ctx => {
                    let userInfo1Result = await ctx.GetResult(DoRequest,"UserInfo1");
                    expect(userInfo1Result.response.status).to.equal(200);
                    expect(userInfo1Result.body.sub).to.equal((await ctx.GetResult(NewGatewayConsent)).consent!.ppid)
                    let revocationResult = await ctx.GetResult(DoRequest,"Revocation")
                    expect(revocationResult.response.status).to.equal(200);
                    let userInfo2Result = await ctx.GetResult(DoRequest,"UserInfo2")
                    expect([400,401]).to.include(userInfo2Result.response.status);
                },600)

        })

        describe('Data Recipient Endpoints', async () => {

            Scenario($ => it.apply(this,$('Revocation (legacy)')), undefined, 'Data recipient honours valid revocation request')
                .Given('New Authorization')
                .Precondition("DH private JWKS available", ctx => {
                    if (!ctx.environment.Config.SystemUnderTest.DhRevokePrivateJwks) {
                        throw "No Dh Private JWKS"
                    }
                })
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                // Call introspection endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint)
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"                    })
                    return options
                },"Introspection1")
                // Call the DR recovaction endpoint with manually constructed request
                .When(DoRequest, async (ctx) => {

                    let url = urljoin(`https://localhost:${ctx.environment.TestServices.httpsProxy.adrServer.port}`,"revoke");

                    let options = DoRequest.Options({
                        method: "POST",
                        url,
                        headers: {
                            "Authorization": "Bearer "+await CreateDhBearerAuthJwt(url)
                        },
                        data:qs.stringify({
                            token:(await ctx.GetResult(NewGatewayConsent)).consent!.refreshToken
                        }),  
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    });

                    return options;
                },"Revocation")
                // Expect:
                .Then(async ctx => {
                    let introspection1Result = await ctx.GetResult(DoRequest,"Introspection1");
                    expect(introspection1Result.response.status).to.equal(200);
                    expect(introspection1Result.body.active).to.be.true

                    let revocationResult = await ctx.GetResult(DoRequest,"Revocation")
                    expect(revocationResult.response.status).to.equal(200);

                    const consent = (await ctx.GetResult(NewGatewayConsent)).consent!;
                    await consent.reload()
                    expect(consent.revokedAt).to.eq("DataHolder")
                    expect(consent.IsCurrent()).to.be.false

                },600)

            Scenario($ => it.apply(this,$('Revocation (cdr_arrangement_id)')), undefined, 'Data recipient honours valid revocation request')
                .Given('New Authorization')
                .Precondition("DH private JWKS available", ctx => {
                    if (!ctx.environment.Config.SystemUnderTest.DhRevokePrivateJwks) {
                        throw "No Dh Private JWKS"
                    }
                })
                // Get a new consent
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }),"Consent1")
                .PreTask(NewGatewayConsent, async ctx => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    arrangementId: (await ctx.GetResult(NewGatewayConsent,"Consent1")).consent.arrangementId,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }),"Consent2")
                // Call introspection endpoint and check "active:true"
                .PreTask(DoRequest,async ctx => {
                    ctx.kv.dhOidc = (await env.TestServices.adrGateway.connectivity.DataHolderOidc((await TestData()).dataHolder.id).GetWithHealing());
                    let options = DoRequest.Options({
                        method: "POST",
                        url: (await TestData()).dataHolder.introspectionEndpoint,
                        data:qs.stringify(_.merge(
                            {token: (await ctx.GetResult(NewGatewayConsent,"Consent2")).consent!.refreshToken},
                            await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint)
                            )),
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        responseType:"json"
                    })
                    return options
                },"Introspection1")
                // Call the DR recovaction endpoint with manually constructed request
                .When(DoRequest, async (ctx) => {

                    const arrangementId = (await ctx.GetResult(NewGatewayConsent,"Consent2")).consent!.arrangementId
                    let url = urljoin(`https://localhost:${ctx.environment.TestServices.httpsProxy.adrServer.port}`,"arrangements/revoke");

                    let options = DoRequest.Options({
                        method: "POST",
                        url,
                        data: qs.stringify({
                            cdr_arrangement_id: arrangementId
                        }),
                        headers: {
                            "Authorization": "Bearer "+await CreateDhBearerAuthJwt(url)
                        },
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    });

                    return options;
                },"Revocation")
                // Expect:
                .Then(async ctx => {
                    let introspection1Result = await ctx.GetResult(DoRequest,"Introspection1");
                    expect(introspection1Result.response.status).to.equal(200);
                    expect(introspection1Result.body.active).to.be.true

                    let revocationResult = await ctx.GetResult(DoRequest,"Revocation")
                    expect(revocationResult.response.status).to.equal(204);
                    
                    const consent = (await ctx.GetResult(NewGatewayConsent)).consent!;
                    await consent.reload()
                    expect(consent.revokedAt).to.eq("DataHolder")
                    expect(consent.IsCurrent()).to.be.false

                },600)

            Scenario($ => it.apply(this,$('Unknown cdr_arrangement_id')), undefined, 'Get 422 for unknown cdr_arrangement_id')
                .Given('New Authorization')
                .Precondition("DH private JWKS available", ctx => {
                    if (!ctx.environment.Config.SystemUnderTest.DhRevokePrivateJwks) {
                        throw "No Dh Private JWKS"
                    }
                })
                .When(DoRequest, async (ctx) => {

                    const arrangementId = "unknown_cdr_arrangement_id"
                    let url = urljoin(`https://localhost:${ctx.environment.TestServices.httpsProxy.adrServer.port}`,"arrangements/revoke");

                    let options = DoRequest.Options({
                        method: "POST",
                        data: qs.stringify({
                            cdr_arrangement_id: arrangementId
                        }),
                        url,
                        headers: {
                            "Authorization": "Bearer "+await CreateDhBearerAuthJwt(url)
                        },
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    });

                    return options;
                },"Revocation")
                // Expect:
                .Then(async ctx => {
                    let revocationResult = await ctx.GetResult(DoRequest,"Revocation")
                    expect(revocationResult.response.status).to.equal(422);

                },600)

        })

        describe('Request Sharing Duration', async () => {
    
            Scenario($ => it.apply(this,$('TS_043')), undefined, 'The DR MUST provide a mechanism for specifying the sharing_duration to the DH.')
                .Given('Cold start')
                .When(SetValue,async (ctx) => (await ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow).GetResult(NewGatewayConsent)).consent,"consent")
                .Then(async ctx => {
                    let consent = <ConsentRequestLog>(await ctx.GetValue("consent"));
                    const id_token = JSON.parse(consent.idTokenJson)

                    expect(id_token.sharing_expires_at).to.be.a('number');

                    let predictedExpiryDifference = Math.abs(moment(id_token.sharing_expires_at * 1000).utc().diff(moment(consent.requestDate).utc().add(86400,'s'),'s'))

                    // Ultimately, expect the predicted expiry date to not differ than the actual one by more time than it takes to complete authorization
                    expect(predictedExpiryDifference).to.be.lessThan(120);
                },120).Keep(SecurityProfileSymbols.Context.TS_043)

            Scenario($ => it.apply(this,$('TS_044')), undefined, 'The DH MUST support the additional sharing_duration claim in the authorisation request object.')
                .Given('Cold start')
                .Proxy(SecurityProfileSymbols.Context.TS_043)

            Scenario($ => it.apply(this,$('TS_045')), undefined, '"sharing_duration" parameter should contain the requested duration for sharing in seconds')
                .Given('Cold start')
                .Proxy(SecurityProfileSymbols.Context.TS_043)

            Scenario($ => it.apply(this,$('TS_049')), undefined, 'DR must be able to obtain the expiration of sharing via the "sharing_expires_at" claim')
                .Given('Cold start')
                .Proxy(SecurityProfileSymbols.Context.TS_043)

            Scenario($ => it.apply(this,$('TS_046')), undefined, 'If "sharing_duration" exceeds one year then only a duration of one year will be assumed')
                .Given('Cold start')
                .When(NewGatewayConsent,async () => ({
                        cdrScopes: ["bank:accounts.basic:read"],
                        sharingDuration: 86400*(365+ 10), // request 1 year + 10 days
                        systemId: "sandbox",
                        userId: "user-12345",
                        dataholderBrandId: (await TestData()).dataHolder.id
                    }))
                .Then(async ctx => {
                    let consent = (await (ctx.GetResult(NewGatewayConsent))).consent;
                    if (typeof consent == 'undefined') throw 'Consent is undefined'

                    const id_token = JSON.parse(consent.idTokenJson)

                    expect(id_token.sharing_expires_at).to.be.a('number');

                    let predictedExpiryDifference = moment(id_token.sharing_expires_at * 1000).utc().diff(moment(consent.requestDate).utc().add(86400*365,'s'),'s')

                    // Expect the predictedExpiryDifference to be off by 10 days
                    expect(predictedExpiryDifference).to.be.lessThan(120).and.greaterThan(-120);
                },120)

            Scenario($ => it.apply(this,$('TS_047')), undefined, 'If "sharing_duration" value is zero or absent then once off access will be assumed and only an Access Token (without a Refresh Token) will be provided on successful authorisation.')
                .Given('Cold start')
                .When(NewGatewayConsent,async () => ({
                        cdrScopes: ["bank:accounts.basic:read"],
                        sharingDuration: 0,
                        systemId: "sandbox",
                        userId: "user-12345",
                        dataholderBrandId: (await TestData()).dataHolder.id
                    }))
                .Then(async ctx => {
                    let consent = (await (ctx.GetResult(NewGatewayConsent))).consent;
                    if (typeof consent == 'undefined') throw 'Consent is undefined'

                    const id_token = JSON.parse(consent.idTokenJson);

                    expect(consent.refreshToken).to.not.be.a('string');
                    expect(id_token.sharing_expires_at).to.equal(0);
                    expect([null,0]).to.contain(id_token.refresh_token_expires_at)

                },120)

            Scenario($ => it.apply(this,$('TS_048')), undefined, 'Authorization fails if "sharing_duration" value is negative')
                .Given('Cold start')
                .When(NewGatewayConsent,async () => {
                    process.env.TEST_HARNESS_MIN_SHARING_DURATION = "-10"
                    return {
                        cdrScopes: ["openid","bank:accounts.basic:read"],
                        sharingDuration: -10,
                        systemId: "sandbox",
                        userId: "user-12345",
                        dataholderBrandId: (await TestData()).dataHolder.id
                    }
                },"not-working")
                .Then(async ctx => {
                    // let completed = (await ctx.GetResult(NewGatewayConsent,"working"));
                    let aborted = (await ctx.GetResult(NewGatewayConsent,"not-working"));
                    // expect(completed.oAuthResult.error).to.be.undefined
                    // expect(completed.oAuthResult.code).to.be.be.a('string').and.not.be.undefined;
                    expect(aborted.oAuthResult.hash?.error).to.equal('invalid_request')

                    delete process.env.TEST_HARNESS_MIN_SHARING_DURATION

                },120)                

        })        
        
        describe('Request Object', async () => {
            Scenario($ => it.apply(this,$('TS_042')), undefined, 'The request parameter MUST be present on requests to the OIDC Hybrid Authorisation End Point.')
                .Given('Cold start')
                .Precondition('Unredirectable selector is defined', async ctx => {
                    if (ctx.environment.Config.Automation?.Puppeteer && typeof ctx.environment.Config.Automation?.Puppeteer.Identifiers.unredirectableMatch === 'undefined') throw 'Unredirectable selector is not defined'
                })
                .When(NewGatewayConsent,async () => ({
                    cdrScopes: ["openid","bank:accounts.basic:read"],
                    sharingDuration: 0,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id,
                    urlFilter: (url:string) => {
                        let u = new URL(url);
                        u.searchParams.delete('request');
                        let urlWithoutRequest = u.toString();
                        return urlWithoutRequest
                    }
                }))
                .Then(async ctx => {
                    let res = await ctx.GetResult(NewGatewayConsent)
                    if (res.oAuthResult.unredirectableError !== true) {
                        throw 'Expected unredirectableError === true'
                    }
                },120)   
        })        

        describe('Endpoints - UserInfo Endpoint', async () => {

            Scenario($ => it.apply(this,$('TS_055')), undefined, 'The UserInfo Endpoint MUST be provided and the UserInfo claims in name and value pairs must be returned in the response.')
                .Given('Already identified user')
                .PreTask(NewGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id,
                    additionalClaims: {
                        userinfo: {
                            auth_time: {essential: true},
                            name: {essential: true},
                            given_name: {essential: true},
                            family_name: {essential: true},
                            updated_at: {essential: true},
                            refresh_token_expires_at: {essential: true},
                            sharing_expires_at: {essential: true},
                        },
                        id_token: {
                            auth_time: {essential: true},
                            name: {essential: true},
                            given_name: {essential: true},
                            family_name: {essential: true},
                            updated_at: {essential: true},
                            refresh_token_expires_at: {essential: true},
                            sharing_expires_at: {essential: true},
                        }    
                    }
                }))
                .When(DoRequest,async ctx => (DoRequest.Options(env.Util.MtlsAgent({
                    method: "GET",
                    url: `${(await AdrGatewayConfig()).adrGateway.path}/cdr/consents/${(await ctx.GetResult(NewGatewayConsent)).consent!.id}/userInfo`,
                    responseType:"json"
                }))))
                .Then(async ctx => {

                    // check auth_time from the original id_token
                    let consent = await ctx.GetResult(NewGatewayConsent);
                    let allClaims = consent.consent.ExistingClaims();
                    expect(allClaims.auth_time).to.be.a("number");
                    expect(moment(allClaims.auth_time*1000).isBefore(moment().subtract(5,'seconds'))).to.eql(true,"Auth time is too late")

                    let result = await (ctx.GetResult(DoRequest));
                    for (let claim of ["sub","acr","name","given_name","family_name","updated_at","refresh_token_expires_at","sharing_expires_at"]) {
                        let value = result.body[claim];
                        expect(value).to.not.be.null.and.not.be.undefined;
                        if (typeof value == 'string') {
                            expect(value).to.not.be.empty; 
                        }
                    }
                    expect(["urn:cds.au:cdr:2"]).to.include(result.body.acr);
                    expect(result.body.name).to.not.be.null.and.not.be.undefined.and.not.be.empty;
                    expect(result.body.given_name).to.not.be.null.and.not.be.undefined.and.not.be.empty;
                    expect(result.body.family_name).to.not.be.null.and.not.be.undefined.and.not.be.empty;
                    expect(moment(result.body.updated_at*1000).isBefore(moment().subtract(5,'seconds'))).to.eql(true,"Updated time is too late")
                    expect(moment(result.body.refresh_token_expires_at*1000).isAfter(moment().add(5,'seconds'))).to.eql(true,"refresh_token_expires_at is too early")
                    expect(moment(result.body.sharing_expires_at*1000).isAfter(moment().add(5,'seconds'))).to.eql(true,"refresh_token_expires_at is too early")
                },240)

        })

        describe('Endpoints - Introspection Endpoint', async () => {

            Scenario($ => it.apply(this,$('TS_056')), undefined, 'The Introspection Endpoint MUST be provided and the Response to the endpoint shall include exactly the following fields active and exp.')
                .Given('Already identified user')
                .PreTask(ExistingCurrentGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .When(DoRequest,async ctx => DoRequest.Options({
                    method: "POST",
                    url: (await TestData()).dataHolder.introspectionEndpoint,
                    data:qs.stringify(_.merge(
                        {token: (await ctx.GetResult(ExistingCurrentGatewayConsent)).consent!.refreshToken},
                        await CreateAssertion((await TestData()).dataHolder.introspectionEndpoint) // TODO change back to introspection endpoint
                        )),
                    key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                    responseType:"json"
                }))
                .Then(async ctx => {
                    let result = await (ctx.GetResult(DoRequest));
                    expect(result.body.active).to.be.a('boolean');
                    expect(result.body.exp).to.be.a('number').and.greaterThan(1);
                },120)

        })

        describe('Identifiers and Subject Types', async () => {

            Scenario($ => it.apply(this,$('TS_035')), 'John', 'The identifier of the authenticated end-user MUST be passed in the sub claim of an ID Token and UserInfo response. Must be consistent and repeatable.')
                .Given('Already identified customer consent, plus a new consent')
                .PreTask(GatewayConsentWithCurrentAccessToken,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(NewGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(DoRequest,async ctx => DoRequest.Options(env.Util.MtlsAgent({
                    method: "GET",
                    url: `${(await AdrGatewayConfig()).adrGateway.path}/cdr/consents/${(await ctx.GetResult(GatewayConsentWithCurrentAccessToken)).consent!.id}/userInfo`,
                    responseType:"json"
                })),"Consent1")
                .When(DoRequest,async ctx => DoRequest.Options(env.Util.MtlsAgent({
                    method: "GET",
                    url: `${(await AdrGatewayConfig()).adrGateway.path}/cdr/consents/${(await ctx.GetResult(NewGatewayConsent)).consent!.id}/userInfo`,
                    responseType:"json"
                })),"Consent2")
                .Then(async ctx => {
                    let result1 = (await ctx.GetResult(DoRequest,"Consent1"));
                    let result2 = (await ctx.GetResult(DoRequest,"Consent2"));
                    expect(result1.body.sub).to.not.be.null
                        .and.not.be.undefined
                        .and.not.be.empty;
                    expect(result2.body.sub).to.not.be.null
                        .and.not.be.undefined
                        .and.not.be.empty;

                    // PPID are consistent and repeatable
                    expect(result2.body.sub).to.equal(result1.body.sub)

                    expect(result1.body.sub).to.equal((await ctx.GetResult(GatewayConsentWithCurrentAccessToken)).consent!.ppid);
                },120)
        })

        describe('Levels of Assurance', async () => {

            Scenario($ => it.apply(this,$('TS_036')), undefined, 'ACR value must be one of "acr": "urn:cds.au:cdr:3" or "acr": "urn:cds.au:cdr:2".')
                .Given('Already identified user')
                .When(ExistingCurrentGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .Then(async ctx => {
                    let result = await (ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow).GetResult(NewGatewayConsent));
                    if (typeof result.consent == 'undefined') throw 'Consent is undefined'
                    expect(JSON.parse(result.consent.idTokenJson).acr)
                        .to.be.a('string')
                        .and.to.match(/^urn:cds.au:cdr:(2|3)$/);
                },120)
        })

        describe.skip('Transaction Security - MTLS', async () => {

            Scenario($ => it.apply(this,$('TS_037')), undefined, 'MTLS connectivity should be established successfully.')
                .Given('Cold start')
                .When(DoRequest,async () => ({requestOptions:<any>{
                    method: "GET",
                    url: (await TestData()).dataHolder.mtlsTestEndpoint,
                    key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                    agentOptions:{ciphers:(await TestData()).supportedCiphers.join(","),maxVersion:"TLSv1.2"},
                }}))
                .Then(async ctx => {
                    // TODO need a better way to test this. We should have a list of endpoints and associated requests that will only work with succesfful MTLS
                    let requestResult = await (ctx.GetResult(DoRequest));
                    expect(requestResult.error).to.be.null;
                    expect(requestResult.response.status).to.equal(200);
                })

            Scenario($ => it.apply(this,$('TS_038')), undefined, 'The server must not trust the client transport certificate issued by other CA other than CDR register and connection should not established successfully.')
                .Given('Cold start')
                .When(DoRequest,async () => ({requestOptions:<any>{
                    method: "GET",
                    url: (await TestData()).dataHolder.mtlsTestEndpoint,
                    key:(await TestData()).dataHolder.clientKeyFiles.invalid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.invalid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.invalid.ca, // TODO check that this ca is appropriate
                    agentOptions:{ciphers:(await TestData()).supportedCiphers.join(","),maxVersion:"TLSv1.2"},
                }}))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    expect(requestResult.response.status.toString()).to.match(/^4\d\d$/);
                })
        })

        describe('Transaction Security - HoK', async () => {

            Scenario($ => it.apply(this,$('TS_039')), undefined, 'Following value should be present in response: "tls_client_certificate_bound_access_tokens": "true"')
                .Given('Cold start')
                .When()
                .Then(async ctx => {
                    await (ctx.GetTestContext(SecurityProfileSymbols.Context.OpenIdDiscoveryResponse).GetResult(SetValue,SecurityProfileSymbols.Values.OpenIdDiscoveryResponse));

                    //let result = requestResult.value;
                    let result = ctx.GetTestContext(SecurityProfileSymbols.Context.OpenIdDiscoveryResponse).GetLastHttpRequest("GET",/well-known/)
                    // Expect the result of the "Do/Measure" to error code
                    expect(result.response?.status).to.equal(200);
                    let oidcConfig = result.response?.data;
                    expect(oidcConfig.tls_client_certificate_bound_access_tokens).to.equal(true);
                })

            Scenario($ => it.apply(this,$('TS_040')), undefined, 'The protected resource MUST obtain the client certificate used for mutual TLS authentication and MUST verify that the certificate matches the certificate associated with the access token')
                .Given('Various client keys and access tokens')
                .Skip()
                .When()
                .Then(async ctx => {
                    expect(() => {throw `Will implement this test later for reference data holder`}).to.not.throw();
                })
        })

        describe('Transaction security TLS version & ciphers', async () => {

            Scenario($ => it.apply(this,$('TS_041.1')), undefined, 'Unsupported cipher results in error;')
                .Given('Cold start')
                .SkipIfBehindProxy()
                .When(DoRequest,async () => ({requestOptions:<any>{
                    method: "GET",
                    url: (await TestData()).dataHolder.mtlsTestEndpoint,
                    key:(await TestData()).dataHolder.clientKeyFiles.invalid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.invalid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    agentOptions:{ciphers:"TLS_CHACHA20_POLY1305_SHA256",maxVersion:"TLSv1.2"},
                }}))
                .Then(async ctx => {
                    // Skip this test if a proxy is in place
                    let requestResult = await (ctx.GetResult(DoRequest));
                    expect(requestResult.error).to.not.be.null;
                    expect(requestResult.error).to.not.be.undefined;
                })

            Scenario($ => it.apply(this,$('TS_041.2')), undefined, 'Unsupported TLS version (i.e. 1.1) results in error')
                .Given('Cold start')
                .SkipIfBehindProxy()
                .When(DoRequest,async () => ({requestOptions:<any>{
                    method: "GET",
                    url: (await TestData()).dataHolder.mtlsTestEndpoint,
                    key:(await TestData()).dataHolder.clientKeyFiles.invalid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.invalid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    agentOptions:{maxVersion:"TLSv1.1",ciphers:(await TestData()).supportedCiphers.join(",")},
                }}))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    expect(requestResult.error).to.not.be.null;
                    expect(requestResult.error).to.not.be.undefined;
                })

        })

        describe('Client Authentication - DR calling DH', async () => {
            const testPayload = async () => {
                return {
                    iss: (await TestData()).dataRecipient.clientId,
                    sub: (await TestData()).dataRecipient.clientId,
                    aud: (await TestData()).dataHolder.revocationEndpoint,
                    jti: uuid.v4(),
                    exp: moment.utc().unix() + 30,
                    iat: moment.utc().unix()
                }
            }

            // Scenario($ => it.apply(this,$('TS_011, TS_017')), undefined, '"private_key_jwt" client authentication method must be implemented successfully by DHs to support authentication of the DRs.')
            //     .Given('Cold start')
            //     .When(DoRequest,() => {throw "Not yet implemented"})
            //     .Then(async ctx => {
            //     })

            describe('TS_012 - The JWT MUST contain the required and MAY contain the OPTIONAL claim values.', async () => {
                let i = 0;

                const expectationSets:{
                    endpoint:() => Promise<string>,
                    endpointName:string,
                    statusCodes:[string,number[]][]
                }[] = [{
                    endpoint: async () => (await TestData()).dataHolder.introspectionEndpoint,
                    endpointName:"introspection",
                    statusCodes: [
                        ["iss",[401,400]],
                        ["sub",[401,400]],
                        ["aud",[401,400]],
                        ["jti",[401,400]],
                        ["exp",[401,400]],
                        ["iat",[200]],
                        ["N/A",[200]]
                    ]
                },
                {
                    endpoint: async () => (await TestData()).dataHolder.revocationEndpoint,
                    endpointName:"revocation",
                    statusCodes: [
                        ["iss",[400,401]],
                        ["sub",[400,401]],
                        ["aud",[400,401]],
                        ["jti",[400,401]],
                        ["exp",[400,401]],
                        ["iat",[200]],
                        ["N/A",[200]]
                    ]
                }]

                for (let expectationSet of expectationSets) {
                    for(let [key,statusCodes] of expectationSet.statusCodes){
                        i++;
                        Scenario($ => it.apply(this,$(`TS_012.${expectationSet.endpointName}.${key}`)).timeout(100000), undefined, `Request without ${key} returns one of ${statusCodes}`)
                        .Given('Cold start')
                        .PreTask(ExistingCurrentGatewayConsent,async () => ({
                            cdrScopes: ["bank:accounts.basic:read"],
                            sharingDuration: 86400,
                            systemId: "sandbox",
                            userId: "user-12345",
                            dataholderBrandId: (await TestData()).dataHolder.id
                        }))
                        .When(DoRequest, async (ctx) => DoRequest.Options({
                            method: "POST",
                            url: await expectationSet.endpoint(),
                            data:qs.stringify(_.merge(
                                {token:(await ctx.GetResult(ExistingCurrentGatewayConsent)).consent!.refreshToken},
                                await CreateAssertionWithoutKey((await TestData()).dataHolder.tokenEndpoint,<string>key)
                                // change back to revoation endpoint
                                )),
                            key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                            cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                            ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                            passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        }))
                        .Then(async ctx => {
                                let requestResult = await (ctx.GetResult(DoRequest));
                                // logger.debug(requestResult.response.request);
                                return expect(statusCodes).to.include(requestResult.response.status);
                            },600).Keep(`TS_012.${expectationSet.endpointName}.${key}`)
                    }

                }
    
                Scenario($ => it.apply(this,$('TS_011')), undefined, '"private_key_jwt" client authentication method must be implemented successfully by DHs to support authentication of the DRs.')
                    .Given('New Auth')
                    .Proxy(/^TS_012\.*/)

                Scenario($ => it.apply(this,$('TS_017')), undefined, '"Only Confidential Client types MUST be supported and Public Clients MUST not be supported.')
                    .Given('New Auth')
                    .Proxy(/^TS_012\.*/)

            })
            // test that not supplying

        })

        
        describe('Authentication Flows - OIDC Hybrid Flow', async () => {

            Scenario($ => it.apply(this,$('TS_001')), undefined, 'Verify for OIDC Hybrid Flow a response_type of code id_token SHALL be allowed')
                .Given('Cold start')
                .When(DoRequest,async () => DoRequest.Options({
                    method: "GET",
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    url: (await TestData()).dataHolder.oidcEndpoint+"/.well-known/openid-configuration"
                }))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let oidcConfig = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    expect(oidcConfig.response_types_supported).to.contain("code id_token");
                })

        })

        describe('Scopes', async () => {

            Scenario($ => it.apply(this,$('TS_021')), undefined, 'Verify in addition to CDR data scopes the following scopes are supported')
                .Given('Cold start')
                .When(DoRequest,async () => DoRequest.Options({
                    method: "GET",
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    url: (await TestData()).dataHolder.oidcEndpoint+"/.well-known/openid-configuration"
                }))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let oidcConfig = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    for (let scope of ["openid","profile","bank:accounts.basic:read","bank:accounts.detail:read","bank:transactions:read","bank:payees:read","bank:regular_payments:read","common:customer.basic:read","common:customer.detail:read"]) {
                        expect(oidcConfig.scopes_supported).to.contain(scope);
                    }
                })
        })

        describe('JSON Web Key Sets', async () => {
            Scenario($ => it.apply(this,$('TS_018')), undefined, 'Verify Data Holder public keys are obtained from the jwks_uri specified by the Data Holders OIDC configuration end point.')
                .Given('Cold start')
                .When(DoRequest,async (ctx) => {
                    let oidcConfig:DataholderOidcResponse = <any>(await (ctx.GetTestContext(SecurityProfileSymbols.Context.OpenIdDiscoveryResponse).GetResult(SetValue))).value;

                    return DoRequest.Options({
                        method: "GET",
                        responseType:"json",
                        url: oidcConfig.jwks_uri,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca
                    })
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let jwks = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    JWKS.asKeyStore(jwks);
                })

            Scenario($ => it.apply(this,$('TS_019')), undefined, 'Verify Data Recipient public keys are obtained from the jwks_uri provided as a Client Metadata field in the Data Recipients SSA.')
                .Given('Cold start')
                .When(DoRequest,async (ctx) => {
                    return DoRequest.Options({
                        method: "GET",
                        responseType:"json",
                        url: ctx.environment.SystemUnderTest.AdrGateway().FrontEndUrls.JWKSEndpoint,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca
                    })
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let jwks = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    JWKS.asKeyStore(jwks);
                })

            Scenario($ => it.apply(this,$('TS_020')), undefined, 'CDR Register public keys MUST only be obtained from the CDR Register JWKS end point.')
                .Given('Cold start')
                .When(DoRequest,async (ctx) => {
                    let jwks_uri = <any>(await (ctx.GetTestContext(RegisterSymbols.Context.RegisterOpenIdDiscoveryResponse).GetResult(SetValue,"jwksEndpoint"))).value;

                    return DoRequest.Options({
                        method: "GET",
                        responseType:"json",
                        url: jwks_uri,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca
                    })
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let jwks = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    JWKS.asKeyStore(jwks);
                })

        })


        describe('Claims', async () => {
            Scenario($ => it.apply(this,$('TS_022')), undefined, 'Verify if the following claims are supported.')
                .Given('Cold start')
                .When(DoRequest,async () => DoRequest.Options({
                    method: "GET",
                    responseType:"json",
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    url: (await TestData()).dataHolder.oidcEndpoint+"/.well-known/openid-configuration"
                }))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let oidcConfig = requestResult.body;
                    expect(requestResult.response.status).to.equal(200);
                    for (let claim of ["name", "given_name", "family_name", "acr", "auth_time", "sub", "refresh_token_expires_at", "sharing_expires_at"]) {
                        expect(oidcConfig.claims_supported).to.contain(claim);
                    }
                })

        })

        describe('Token - Access Token', async () => {

            Scenario($ => it.apply(this,$('TS_028')), undefined, 'Access Tokens MUST be provided by the DH in exchange of Authorization code for accessing the resources.')
                .Given('New Auth')
                .Proxy(SecurityProfileSymbols.Context.MainAuthorizationFlow)

            Scenario($ => it.apply(this,$('TS_029')), undefined, 'An Access Token MUST expire between 2 minutes and 10 minutes as decided by the Data Holder.')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.RefreshAccessToken);
                    const consent = (await authCtx.GetResult(RefreshAccessTokenForConsent,"updatedConsent")).consent;
                    if (typeof consent == 'undefined') throw 'Consent is undefined'

                    await consent.reload();

                    const newExpiry = moment(consent.accessTokenExpiry).utc();
                    const issuedTime = (await (authCtx.GetResult(SetValue,"currentTimeUtc"))).value

                    const duration = newExpiry.diff(issuedTime,'seconds');

                    expect(duration).to.be.at.least(2*60 - 10);
                    expect(duration).to.be.at.most(10*60 + 10);
                }).Keep(SecurityProfileSymbols.Context.TS_029)

            Scenario($ => it.apply(this,$('TS_030')), undefined, 'Verify that HTTP error code(401 Unauthorized) is returned when the access token used to access an resource has expired or invalid.')
                .Given('Cold start')
                .When(DoRequest,async () => DoRequest.Options({
                    method: "GET",
                    url: urljoin((await TestData()).dataHolder.resourceEndpoint,"cds-au/v1/banking/accounts"),
                    key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                    cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                    ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                    passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                    headers: {Authorization: `Bearer invalid_token`, "x-v":"1"}
                }))
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    expect(requestResult.response.status).to.equal(401);
                })

        })

        describe('Token - Refresh Token', async () => {

            Scenario($ => it.apply(this,$('TS_031')), undefined, 'An Access Token refresh should be successful.')
                .Given('Existing Auth')
                .PreTask(NewGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read"],
                    sharingDuration: 86400,
                    systemId: "sandbox",
                    userId: "revoking-user",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(SetValue, ctx => {
                    return moment().utc();
                },"currentTimeUtc")
                .PreTask(SetValue,async ctx => {
                    return (await (ctx.GetResult(NewGatewayConsent))).consent!.accessToken;
                },"previousAccessToken")
                .When(RefreshAccessTokenForConsent,async ctx => {
                    return (await (ctx.GetResult(NewGatewayConsent))).consent!;
                },"updatedConsent")
                .Then(async ctx => {
                    const previousAccessToken = (await ctx.GetResult(SetValue,"previousAccessToken")).value;
                    const updatedConsent = (await ctx.GetResult(RefreshAccessTokenForConsent,"updatedConsent")).consent!;
                    const newAccessToken = updatedConsent.accessToken;

                    expect(previousAccessToken).to.be.a('string');
                    expect(newAccessToken).to.be.a('string');
                    expect(previousAccessToken).to.not.equal(newAccessToken);

                },120).Keep(SecurityProfileSymbols.Context.RefreshAccessToken)

            Scenario($ => it.apply(this,$('TS_032')), undefined, 'The expiration of the refresh token MUST be set by data holder and MAY be of any length greater than 28 days.')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow);
                    const consent = (await (authCtx.GetResult(NewGatewayConsent))).consent
                    if (typeof consent == 'undefined') throw 'Consent is undefined'

                    logger.debug(consent)

                    const claims = consent.ExistingClaims();
                    expect(claims.iat).to.be.a('number');
                    expect(claims.refresh_token_expires_at).to.be.a('number');
                    expect(claims.sharing_expires_at).to.be.a('number');

                    const refreshExpiry = moment(0).add(claims.refresh_token_expires_at,"s").utc();
                    const sharingEnd = moment(0).add(claims.sharing_expires_at,"s").utc();
                    const iat = moment(claims.iat*1000).utc();

                    // iat should not be much different from now
                    expect(iat.diff(moment(),'s')).to.be.at.most(30);

                    const refreshTokenLifetimeDays = refreshExpiry.diff(iat,'days');
                    const refreshTokenLifetimeSeconds = refreshExpiry.diff(iat,'seconds');

                    const sharingEndDateDiff = sharingEnd.diff(iat,'seconds');

                    expect(refreshTokenLifetimeSeconds).to.be.at.least(Math.min(
                        sharingEndDateDiff,
                        28*86400
                    ) - 30);

                    expect(refreshTokenLifetimeDays).to.be.at.most(365);
                }).Keep(SecurityProfileSymbols.Context.TS_032)

        })

        describe('Token Expiry', async () => {

            Scenario($ => it.apply(this,$('TS_033')), undefined, 'The DH MUST indicate the lifetime in seconds of the access token in the expires_in field.')
                .Given('New Auth')
                .Proxy(SecurityProfileSymbols.Context.TS_029)

            Scenario($ => it.apply(this,$('TS_034')), undefined, 'The DH MUST indicate the expiration time of the refresh token using the refresh_token_expires_at claim.')
                .Given('New Auth')
                // .Proxy("TS_032")
                .Proxy(SecurityProfileSymbols.Context.TS_032)

            Scenario($ => it.apply(this,$('Consent Expiry HTTP Status Code')), '', 'ADR Gateway should return a 403 for a one-time consent it knows is expired.')
                .Given('New consent')
                .PreTask(NewGatewayConsent, async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 0,
                    systemId: "sandbox",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .When(DoRequest, async ctx => {
                    let consent = await ctx.GetResult(NewGatewayConsent);
                    consent.consent.accessTokenExpiry = moment().subtract(1, 'day').toDate();
                    const connection = await ctx.environment.TestServices.adrDbConn;
                    consent.consent.save();
                    // await connection.getRepository(ConsentRequestLog).save(consent.consent);
                    ClearDefaultInMemoryCache();

                    return DoRequest.Options(env.Util.MtlsAgent({
                        responseType:"json",
                        headers: {
                            "x-adrgw-present": false,
                            "x-adrgw-last-authenticated": moment().subtract(1,'hour').toISOString()
                        },
                        url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts")
                    }))
                })
                .Then(async ctx => {
                    let result = await ctx.GetResult(DoRequest);
                    expect(result.response.status).to.equal(403);
                    expect(result.response.data).contains("One time access token has expired");
                },120)
        })

        describe('Token - ID Token', async () => {

            Scenario($ => it.apply(this,$('TS_023')), undefined, 'ID Token must be signed and encrypted by dataholders and sent it back to the DRs')
                .Given('Cold start')
                .Proxy(SecurityProfileSymbols.Context.MainAuthorizationFlow)

            Scenario($ => it.apply(this,$('TS_024')), undefined, 'ID token must include c_hash and s_hash')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow);
                    let id_token_claims = (await authCtx.GetResult(SetValue,"id_token_claims")).value
                    logger.debug(id_token_claims)
                    expect(id_token_claims.c_hash).to.be.a('string');
                    expect(id_token_claims.s_hash).to.be.a('string');
                })

            Scenario($ => it.apply(this,$('TS_025')), undefined, 'ID Token returned from the Authorization end point must not contain any personal information claims')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow);
                    const consent = (await (authCtx.GetResult(NewGatewayConsent))).consent
                    const id_token = JSON.parse(consent!.idTokenJson);

                    const piClaims = ["name","given_name","family_name","middle_name","nickname","preferred_username","profile","picture","website","email","email_verified","gender","birthdate","zoneinfo","locale","phone_number","phone_number_verified","address"]
                    const piClaimsInIdToken = _.intersection(piClaims,_.keys(id_token));
                    expect(piClaimsInIdToken).length(0);
                })

            Scenario($ => it.apply(this,$('TS_026')), undefined, 'ID Token must not contain both vot claim and acr claim')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow);
                    const consent = (await (authCtx.GetResult(NewGatewayConsent))).consent
                    const id_token = JSON.parse(consent!.idTokenJson);

                    const votAcr = _.intersection(["vot","acr"],_.keys(id_token));
                    expect(votAcr.length).lessThan(2);
                })

            Scenario($ => it.apply(this,$('TS_027')), undefined, 'If ID token contains vot claim then it must also contain a vtm claim')
                .Given('New Auth')
                .When()
                .Then(async ctx => {
                    const authCtx = ctx.GetTestContext(SecurityProfileSymbols.Context.MainAuthorizationFlow);
                    const consent = (await (authCtx.GetResult(NewGatewayConsent))).consent
                    const id_token = JSON.parse(consent!.idTokenJson);

                    if (typeof id_token.vot != 'undefined') {
                        expect(id_token.vtm).to.be.a('string')
                    }
                })                


        })

    })

})
