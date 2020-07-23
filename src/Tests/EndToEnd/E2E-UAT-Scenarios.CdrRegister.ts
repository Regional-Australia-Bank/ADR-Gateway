import { Scenario as ScenarioBase, TestContext } from "./Framework/TestContext";
import { DoRequest } from "./Framework/DoRequest";
import { expect } from "chai";
import * as _ from "lodash"
import { SetValue } from "./Framework/SetValue";
import { CreateAssertion } from "../../AdrGateway/Server/Connectivity/Assertions";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import urljoin from "url-join"
import { JWT } from "jose";
import moment from "moment";
import qs from "qs";

export const RegisterSymbols = {
    Context: {
        GetDataHolderBrands: Symbol.for("GetDataHolderBrands"),
        DRStatuses: Symbol.for("DRStatuses"),
        RegisterToken: Symbol.for("RegisterToken"),
        RegisterOpenIdDiscoveryResponse: Symbol.for("RegisterOpenIdDiscoveryResponse"),
        GetSSA: Symbol.for("GetSSA"),
    },
    Values: {
        GetDataHolderBrandsAll: Symbol.for("GetDataHolderBrandsAll")    
    }
}

export const Tests = ((environment:E2ETestEnvironment) => {

    function Scenario(testFnDefiner: (testDefFn:(scenarioId:string) => [string,() => Promise<any>]) => Mocha.Test, persona: string | undefined, description?: string | undefined) {
        return ScenarioBase(testFnDefiner,persona,environment,description)
    }

    const SoftwareProductActiveCondition = async (ctx:TestContext) => {
        let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
        if (!(statuses.legalEntity == 'ACTIVE' && statuses.brand == 'ACTIVE' && statuses.product == 'ACTIVE')) {
            throw 'Cannot proceed'
        }
    }

    const DataRecipientIsActive = async (ctx:TestContext) => {
        let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
        if (!(statuses.legalEntity == 'ACTIVE' && statuses.brand == 'ACTIVE')) {
            throw 'Cannot proceed'
        }
    }

    describe('CDR Register', async () => {

        Scenario($ => it.apply(this,$('Data Recipient Statuses')), undefined, 'Get the status of the data recipient')
            .Given('Cold start')
            .PreTask(DoRequest,async (ctx) => {
                let url = urljoin(
                    environment.SystemUnderTest.Register().PublicUri,
                    'v1/banking/data-recipients',
                )
                return DoRequest.Options(environment.Util.TlsAgent({
                    method: "GET",
                    responseType: "json",
                    headers: {
                        'accept':'application/json'
                    },
                    url
                }))
            })
            .When(SetValue,async (ctx) => {
                let connectivityConfig = (await environment.GetServiceDefinition.Connectivity())
                let softwareProductConfig = await environment.TestServices.adrGateway.connectivity.SoftwareProductConfig("sandbox",undefined).Evaluate()

                let drs:any[] = (await (ctx.GetResult(DoRequest))).body.data
                
                let myDrStatus = _.filter(drs,dr => dr.legalEntityId === connectivityConfig.LegalEntityId)[0];
                let myBrandStatus = _.filter(myDrStatus.dataRecipientBrands,b => b.dataRecipientBrandId === connectivityConfig.BrandId)[0];
                let myProductStatus = _.filter(myBrandStatus.softwareProducts,b => b.softwareProductId === softwareProductConfig.ProductId)[0];
                
                let legalEntity = myDrStatus.status
                let brand = myBrandStatus.status
                let product = myProductStatus.status

                return {
                    legalEntity,
                    brand,
                    product
                }

            },"Statuses")
            .Then(async ctx => {
                let requestResult = await (ctx.GetResult(DoRequest));

                expect(requestResult.response.status).to.eq(200)

                console.log(await ctx.GetValue("Statuses"))

            }).Keep(RegisterSymbols.Context.DRStatuses)

        Scenario($ => it.apply(this,$('Register OIDC')), undefined, 'Validate OpenID Provider Configuration End Point.')
            .Given('Cold start')
            .PreTask(DoRequest,async () => {
                console.log(environment.SystemUnderTest.Register())
                return ({
                    requestOptions:await environment.Mtls({
                        method: "GET",
                        url: environment.SystemUnderTest.Register().DiscoveryUri+"/.well-known/openid-configuration",
                        responseType:"json"
                    })
                })
            })
            .PreTask(SetValue,async (ctx) => 
                (await (ctx.GetResult(DoRequest))).body.jwks_uri
            ,"jwksEndpoint")
            .When(SetValue,async (ctx) => 
                (await (ctx.GetResult(DoRequest))).body.token_endpoint
            ,"tokenEndpoint")
            .Then(async ctx => {
                let requestResult = await (ctx.GetResult(DoRequest));
                console.log(requestResult.response.body);
                expect(requestResult.response.status).to.equal(200);
                expect(await (ctx.GetValue("tokenEndpoint"))).to.be.a('string').that.is.not.empty;
                expect(requestResult.body.grant_types_supported).to.be.an('array').that.contains("client_credentials");

            }).Keep(RegisterSymbols.Context.RegisterOpenIdDiscoveryResponse)

        Scenario($ => it.apply(this,$('TS_013')), undefined, 'Get token using client assertion')
            .Given('Valid OIDC Endpoint')
            .PreTask(SetValue,async (ctx) => 
                await ctx.GetTestContext(RegisterSymbols.Context.RegisterOpenIdDiscoveryResponse).GetValue("tokenEndpoint")
            ,"tokenEndpoint")
            .PreTask(DoRequest,async (ctx) => {
                let client_id = (await environment.GetServiceDefinition.Connectivity()).BrandId
                let endpoint = await ctx.GetValue("tokenEndpoint")
                return DoRequest.Options(await environment.Mtls({
                    method: "POST",
                    responseType: "json",
                    url: endpoint,
                    data:qs.stringify({
                        grant_type: "client_credentials",
                        scope: "cdr-register:bank:read",
                        client_id: client_id,
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion: CreateAssertion(client_id,endpoint,await environment.GetAdrPrivateJwks())
                    })
                }))
            },"getTokenResponse")
            .When(SetValue,async (ctx) => 
                (await (ctx.GetResult(DoRequest))).body.access_token
                ,"token")
            .Then(async ctx => {
                let requestResult = await (ctx.GetResult(DoRequest,"getTokenResponse"));
                // console.log(requestResult);
                let responseBody = requestResult.body;
                let scopes:string[] = responseBody.scope.split(" ");
                console.log(responseBody.access_token);
                expect(requestResult.response.status).to.equal(200);
                expect(responseBody.token_type).to.equal("Bearer");
                expect(scopes).to.include("cdr-register:bank:read");

            }).Keep(RegisterSymbols.Context.RegisterToken)

        Scenario($ => it.apply(this,$('TS_014')), undefined, 'The JWT MUST contain the required claim values.')
            .Given('Valid OIDC Endpoint')
            .Proxy(RegisterSymbols.Context.RegisterToken)

        Scenario($ => it.apply(this,$('TS_064')), undefined, 'Get SSA')
            .Given('Current token')
            .Precondition('Software product is active',SoftwareProductActiveCondition)
            .PreTask(DoRequest,async (ctx) => {
                let url = urljoin(
                    environment.SystemUnderTest.Register().SecureUri,
                    'v1/banking/data-recipients/brands',
                    (await environment.GetServiceDefinition.Connectivity()).BrandId,
                    'software-products',
                    (await environment.OnlySoftwareProductConfig()).ProductId,
                    'ssa'
                )
                return {requestOptions: await environment.Mtls({
                    method: "GET",
                    responseType: "json",
                    headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                    url
                })}
            })
            .When(SetValue,async (ctx) => 
                (await (ctx.GetResult(DoRequest))).body
                ,"SSA")
            .Then(async ctx => {
                let requestResult = await (ctx.GetResult(DoRequest));
                // let ssa = (await (ctx.GetResult(SetValue,"SSA"))).value

                if (typeof requestResult.response.headers['content-type'] == 'undefined' || /^application\/jwt(; ?charset=utf-8)?$/.test(requestResult.response.headers['content-type']) == false) {
                    throw `GetSoftwareStatementAssertion response type is not 'application/jwt', but '${requestResult.response.headers['content-type']}'`;
                }

                let responseJwt = requestResult.body;
                console.log(responseJwt);
                JWT.decode(responseJwt,{complete:true})

            }).Keep(RegisterSymbols.Context.GetSSA)

        describe('TS_065', async () => {
            Scenario($ => it.apply(this,$('TS_065')), undefined, 'Get SSA with invalid brand returns 403')
                .Given('Current token')
                .Precondition('Software product is active',SoftwareProductActiveCondition)
                .When(DoRequest,async (ctx) => {
                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-recipients/brands',
                        'invalid-brand-id',
                        'software-products',
                        (await environment.OnlySoftwareProductConfig()).ProductId,
                        'ssa'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    if (requestResult.response.status != 403) {
                        throw `Expected status code 403 but received ${requestResult.response.status}`;
                    }

                })

            Scenario($ => it.apply(this,$('TS_065')), undefined, 'Get SSA with invalid software product returns 404')
                .Given('Current token')
                .Precondition('Software product is active',SoftwareProductActiveCondition)
                .When(DoRequest,async (ctx) => {
                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-recipients/brands',
                        (await environment.GetServiceDefinition.Connectivity()).BrandId,
                        'software-products',
                        'invalid-software-product-id',
                        'ssa'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    if (requestResult.response.status != 404) {
                        throw `Expected status code 404 but received ${requestResult.response.status}`;
                    }

                })

            })

            Scenario($ => it.apply(this,$('TS_066')), undefined, 'Get SSA while DR is not accredited')
                .Given('Current token')
                .Precondition("Brand or Legal status is not ACTIVE",async (ctx) => {
                    let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
                    if ((statuses.legalEntity == 'ACTIVE' && statuses.legalEntity == 'ACTIVE')) {
                        throw 'Cannot proceed'
                    }
                })
                .When(SetValue,async (ctx) => {
                    await ctx.environment.TestServices.adrGateway.connectivity.SoftwareStatementAssertion(await environment.OnlySoftwareProduct()).Evaluate({ignoreCache:"all"}).catch(console.error)
                })
                .Then(async ctx => {
                    let log = ctx.GetLastHttpRequest(undefined,/(token|ssa)$/)

                    if (log.config.url.endsWith("ssa")) {
                        expect(log.response.status).to.eq(403)
                    } else {
                        // token endpoint returns 401
                        expect(log.response.status).to.eq(400)
                    }
                })

            Scenario($ => it.apply(this,$('TS_068')), undefined, 'Get SSA while DR software product is Inactive')
                .Given('Current token')
                .Precondition("Software product is Inactive",async (ctx) => {
                    let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
                    if ((statuses.product !== 'INACTIVE')) {
                        throw 'Cannot proceed'
                    }
                })
                .When(SetValue,async (ctx) => {
                    await ctx.environment.TestServices.adrGateway.connectivity.SoftwareStatementAssertion(await environment.OnlySoftwareProduct()).Evaluate({ignoreCache:"all"}).catch(console.error)
                })
                .Then(async ctx => {
                    let log = ctx.GetLastHttpRequest(undefined,/(token|ssa)$/)

                    if (log.config.url.endsWith("ssa")) {
                        expect(log.response.status).to.eq(403)
                    } else {
                        // token endpoint returns 401
                        expect(log.response.status).to.eq(400)
                    }
                })

            Scenario($ => it.apply(this,$('TS_069')), undefined, 'Get SSA while DR software product is Removed')
                .Given('Current token')
                .Precondition("Software product is Removed",async (ctx) => {
                    let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
                    if ((statuses.product !== 'REMOVED')) {
                        throw 'Cannot proceed'
                    }
                })
                .When(SetValue,async (ctx) => {
                    await ctx.environment.TestServices.adrGateway.connectivity.SoftwareStatementAssertion(await environment.OnlySoftwareProduct()).Evaluate({ignoreCache:"all"}).catch(console.error)
                })
                .Then(async ctx => {
                    let log = ctx.GetLastHttpRequest(undefined,/(token|ssa)$/)

                    if (log.config.url.endsWith("ssa")) {
                        expect(log.response.status).to.eq(403)
                    } else {
                        // token endpoint returns 401
                        expect(log.response.status).to.eq(400)
                    }
                })


            Scenario($ => it.apply(this,$('TS_072')), undefined, 'Get SSA with invalid access token')
                .Given('Cold start + MTLS creds')
                .When(DoRequest,async (ctx) => {
                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-recipients/brands',
                        (await environment.GetServiceDefinition.Connectivity()).BrandId,
                        'software-products',
                        (await environment.OnlySoftwareProductConfig()).ProductId,
                        'ssa'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        responseType: "json",
                        headers: {Authorization: `Bearer anyoldinvalidtoken`},
                        url
                    })}
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    if (requestResult.response.status != 401) {
                        throw `Expected status code 401 but received ${requestResult.response.status}`;
                    }
                })

            Scenario($ => it.apply(this,$('TS_074')), undefined, 'SSA expires after 30 minutes')
                .Given('SSA')
                .Precondition('Software product is active',SoftwareProductActiveCondition)
                .When(SetValue)
                .Then(async ctx => {
                    let ssa:string = await ctx.GetTestContext(RegisterSymbols.Context.GetSSA).GetValue("SSA");
                    let payload = <any>JWT.decode(ssa,{complete:true}).payload;

                    let diff = moment.utc(payload.exp*1000).diff(moment.utc(),'seconds')/60;
                    console.log(`${diff} SSA minutes to expiry`)
                    if (diff < 0 || Math.abs(diff-30) > 0.1) throw `Does not expire in 30 minutes, but ${diff}`;
                })


            Scenario($ => it.apply(this,$('GetDataHolderBrands')), undefined, 'Get all data holders')
                .Given('Current token')
                .Precondition("Data recipient status is active",DataRecipientIsActive)
                .PreTask(DoRequest,async (ctx) => {
                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-holders/brands'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        responseType: "json",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .When(SetValue,async (ctx) => 
                    (await (ctx.GetResult(DoRequest))).body.data
                    ,RegisterSymbols.Values.GetDataHolderBrandsAll)
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
    
                    if (typeof requestResult.response.headers['content-type'] == 'undefined' || /^application\/json(; ?charset=utf-8)?$/.test(requestResult.response.headers['content-type']) == false) {
                        throw `GetSoftwareStatementAssertion response type is not 'application/json', but '${requestResult.response.headers['content-type']}'`;
                    }
    
                    let dataHolders = requestResult.body.data;
                    console.log(JSON.stringify(dataHolders));
    
                }).Keep(RegisterSymbols.Context.GetDataHolderBrands)

            Scenario($ => it.apply(this,$('TS_075')), undefined, 'Get subset of data holders updated since some time')
                .Given('Current token')
                .Precondition("Data recipient status is active",DataRecipientIsActive)
                .PreTask(SetValue, async (ctx) => {
                    let dataholders:any[] = await ctx.GetTestContext(RegisterSymbols.Context.GetDataHolderBrands).GetValue(RegisterSymbols.Values.GetDataHolderBrandsAll);
                    let dataholdersSorted = _.sortBy(dataholders, dh => dh.lastUpdated)
                    let lastDh = _.last(dataholdersSorted);
                    let lastUpdated = lastDh.lastUpdated;
                    let lastDhs = _.filter(dataholders, dh => moment.utc(dh.lastUpdated).diff(lastUpdated,'s') == 0);

                    (<any>ctx).lastUpdated = moment.utc(lastUpdated).toISOString();

                    return lastDhs;
                },"LastDhs")
                .PreTask(DoRequest,async (ctx) => {

                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-holders/brands'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        params: {
                            "updated-since": (<any>ctx).lastUpdated
                        },
                        responseType: "json",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .When(SetValue,async (ctx) => 
                    (await (ctx.GetResult(DoRequest))).body.data
                    ,"All")
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
    
                    if (requestResult.response.status != 200) {
                        throw `Response was not 200 but '${requestResult.response.status}'`;
                    }
    
                    let allDataHolders = await ctx.GetTestContext(RegisterSymbols.Context.GetDataHolderBrands).GetValue(RegisterSymbols.Values.GetDataHolderBrandsAll); 
                    let lastDataHolders = await ctx.GetValue("LastDhs");
                    let dataHoldersFiltered = requestResult.body.data;

                    console.log(JSON.stringify({allDataHolders,lastDataHolders,dataHoldersFiltered}));
                    if (!_.isEqual(lastDataHolders,dataHoldersFiltered)) {
                        throw `The filtered list of data holders does not match expectation`
                    }
   
                })

            Scenario($ => it.apply(this,$('TS_076')), undefined, 'Get second page of results (page 2, page size 2)')
                .Given('Current token')
                .Precondition("Data recipient status is active",DataRecipientIsActive)
                .Precondition("At least 4 data holders at the register",async (ctx) => {
                    let dataholders:any[] = await ctx.GetTestContext(RegisterSymbols.Context.GetDataHolderBrands).GetValue(RegisterSymbols.Values.GetDataHolderBrandsAll);
                    if (dataholders.length < 4) {
                        throw 'At least 4 dataholders are needed for this test'
                    }
                })
                .PreTask(SetValue, async (ctx) => {

                    let dataholders:any[] = await ctx.GetTestContext(RegisterSymbols.Context.GetDataHolderBrands).GetValue(RegisterSymbols.Values.GetDataHolderBrandsAll);

                    console.info("Expected page 2, size 2 from set of All.")

                    let page2Dhs = _.map([2,3],i => dataholders[i])
                    console.log(page2Dhs);

                    return page2Dhs;
                },"Page2Dhs")
                .PreTask(DoRequest,async (ctx) => {

                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-holders/brands'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        params: {
                            "page-size": 2,
                            "page":2
                        },
                        responseType: "json",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .When(SetValue,async (ctx) => 
                    (await (ctx.GetResult(DoRequest))).body.data)
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
    
                    if (requestResult.response.status != 200) {
                        throw `Response was not 200 but '${requestResult.response.status}'`;
                    }
    
                    let allDataHolders = await ctx.GetTestContext(RegisterSymbols.Context.GetDataHolderBrands).GetValue(RegisterSymbols.Values.GetDataHolderBrandsAll); 
                    let page2DataHolders = await ctx.GetValue("Page2Dhs");
                    let dataHoldersPaginated= requestResult.body.data;

                    console.log(JSON.stringify({allDataHolders,page2DataHolders,dataHoldersPaginated}));
                    if (!_.isEqual(page2DataHolders,dataHoldersPaginated)) {
                        throw `The page of data holders does not match expectation`
                    }
    
                })

            Scenario($ => it.apply(this,$('TS_077')), undefined, 'Get page size 30')
                .Given('Current token')
                .Precondition("Data recipient status is active",DataRecipientIsActive)
                .When(DoRequest,async (ctx) => {

                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-holders/brands'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        params: {
                            "page-size": 30
                        },
                        responseType: "json",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
    
                    if (requestResult.response.status != 200) {
                        throw `Response was not 200 but '${requestResult.response.status}'`;
                    }
    
                    let selfLink = requestResult.body.links.self;

                    if (!(/[\&\?]page-size=30/.test(selfLink))) {
                        throw `Expected self link to have page-size 30 but it did not. Instead: ${selfLink}`
                    }
    
                })

            Scenario($ => it.apply(this,$('TS_078')), undefined, 'GetDHBrands returns forbidden when DR is not accredited')
                .Given('Current token')
                .Precondition("DR is not accredited",async (ctx) => {
                    let statuses = await ctx.GetTestContext(RegisterSymbols.Context.DRStatuses).GetValue("Statuses")
                    if ((statuses.brand == 'ACTIVE' || statuses.legalEntity == 'ACTIVE')) {
                        throw 'Cannot proceed'
                    }
                })
                .When(DoRequest,async (ctx) => {

                    let url = urljoin(
                        environment.SystemUnderTest.Register().SecureUri,
                        'v1/banking/data-holders/brands'
                    )
                    return {requestOptions: await environment.Mtls({
                        method: "GET",
                        qs: {
                            "page-size": 30
                        },
                        responseType: "json",
                        headers: {Authorization: `Bearer ${await ctx.GetTestContext(RegisterSymbols.Context.RegisterToken).GetValue("token")}`},
                        url
                    })}
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
    
                    if (requestResult.response.status != 200) {
                        throw `Response was not 200 but '${requestResult.response.status}'`;
                    }
    
                    let selfLink = requestResult.body.links.self;

                    if (!(/[\&\?]page-size=30/.test(selfLink))) {
                        throw `Expected self link to have page-size 30 but it did not. Instead: ${selfLink}`
                    }
    
                })

    
    })
})