import uuid from "uuid";
import moment from "moment";
import { GatewayConsentWithCurrentAccessToken, NewGatewayConsent } from "./NewGatewayConsent";
import { JWKS } from "jose";
import { SetValue } from "./Framework/SetValue";
import { ConsentRequestLog } from "../../AdrGateway/Entities/ConsentRequestLog";
import { Scenario as ScenarioBase, TestContext } from "./Framework/TestContext"
import { expect } from "chai";

import { DoRequest, DoRequestResult, DepaginateRequest, TransformMtlsOptions } from "./Framework/DoRequest";
import * as _ from 'lodash';
import { GenerateTestData } from "./Framework/TestData";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
import urljoin from "url-join";
import { axios } from "../../Common/Axios/axios";
import Validator from "validatorjs"
// const validator = require('validator');
import {isAscii} from "validator"
import { Dictionary } from "tsyringe/dist/typings/types";

const TestBoundaries = {
    "oldest-time": "2020-04-20T00:00:00+1100",
    "newest-time": "2020-04-22T00:00:00+1100",
    "min-amount": "12.00",
    "max-amount": "15.00"
}

///^-?\d+\.\d\d(\d*[1-9])?$/.test("13123.001")

// new RegExp('^-?\\d+\\.\\d\\d(\\d*[1-9])?$').test("13123.001")

const amountString = 'regex:/^-?\\d+\\.\\d\\d(\\d*[1-9])?$/'

const balanceRules = {
'accountId': 'required|string',
'currentBalance': ['required','string', "AmountString"],
'availableBalance': ['required','string', "AmountString"],
'creditLimit': "AmountString",
'amortisedLimit': "AmountString",
'currency': "CurrencyString",
'purses': 'array',
'purses.*.amount': ['required','string', "AmountString"],
'purses.*.currency': "CurrencyString"
};

const AssertUnorderedListEquivalence = (left:any[],right:any[]) => {
    if (left.length != right.length) throw 'Left and right have different lengths'
    
    for (let i = 0; i < left.length; i++) {
        let leftItem = left[i]
        let matchingRightItem = _.find(right, t => _.isEqual(t,leftItem))
        if (!matchingRightItem) throw `No matching transaction can be found for left[${i}] in right`
    }

    for (let i = 0; i < right.length; i++) {
        let rightItem = right[i]
        let matchingLeftItem = _.find(right, t => _.isEqual(t,rightItem))
        if (!matchingLeftItem) throw `No matching transaction can be found for right[${i}] in left`
    }

}

Validator.register("customerTypeValidation", (customerObject:any) => {
    if (customerObject?.customerUType == "person") {
        return (typeof customerObject.person === "object" && typeof customerObject.organisation === "undefined")
    } else {
        return (typeof customerObject.organisation === "object" && typeof customerObject.person === "undefined")
    }
}, "person or organisation not present under conditions");


Validator.register("AmountString", (s:any) => {
    if (typeof s !== 'string') return false;
    if (!(/^-?\d+\.\d\d(\d*[1-9])?$/.test(s))) return false;
    return true;
}, "Not an AmountString");

Validator.register("CurrencyString", (s:any) => {
    if (typeof s !== 'string') return false;
    if (!(/^[A-Z]{3,3}$/.test(s))) return false;
    return true;
}, "Not a CurrencyString");

Validator.register("DateTimeString", (s:any) => {
    if (typeof s !== 'string') return false;
    if (!(/^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|(\+|\-)\d\d:\d\d)$/.test(s))) return false;
    if (!moment(s).toISOString) return false;
    return true;
}, "Not a DateTimeString");

Validator.register("DateString", (s:any) => {
    if (typeof s !== 'string') return false;
    if (!(/^\d\d\d\d-\d\d-\d\d$/.test(s))) return false;
    if (!moment(s).toISOString) return false;
    return true;
}, "Not a DateString");


Validator.register("ASCIIString", (s:any) => {
    if (typeof s !== 'string') return false;
    return isAscii(s);
}, "Not a DateTimeString");


Validator.register("object", (s:any) => {
    return (typeof s === 'object')
}, "Not an object");


Validator.register("MaskedAccountString", (s:any) => {
    if (typeof s !== 'string') return false;
    if (!(/^[x\-]+?[ -~]{4,4}$/.test(s))) return false;
    if (!moment(s).toISOString) return false;
    return true;
}, "Not a MaskedAccountString");



const customerRules = {
    "customer.customerUType": ['required','string', 'regex:/^(person|organisation)$/'],
    "customer": 'customerTypeValidation',
    "customer.person.lastUpdateTime": "DateTimeString",
    "customer.person.firstName": "string",
    "customer.person.lastName": "required|string",
    "customer.person.middleNames": "present|array",
    "customer.person.middleNames.*": "string",
    "customer.person.prefix": "string",
    "customer.person.suffix": "string",
    "customer.person.occupationCode": "string" // no further validation

}

const transactionRules = {
    "accountId": ['required','string'],
    "transactionId": ['string'],
    "isDetailAvailable": 'required:boolean',
    "type": ['required','string','regex:/^(FEE|INTEREST_CHARGED|INTEREST_PAID|TRANSFER_OUTGOING|TRANSFER_INCOMING|PAYMENT|DIRECT_DEBIT|OTHER)$/'],
    "status": ['required','string','regex:/^(POSTED|PENDING)$/'],

    "description": ['required','string'],

    "postingDateTime": ['required_if:status,POSTED','DateTimeString'],
    "valueDateTime": ['DateTimeString'],
    "executionDateTime": ['DateTimeString'],
    "amount":['required',"AmountString"],
    "currency": "CurrencyString",
    "reference": "present|string",
    merchantName:'string',
    merchantCategoryCode:'string',
    billerCode:'string',
    billerName:'string',
    crn:'string',
    apcaNumber:'string'
}

const transactionDetailRules = {
    "extendedData":'present|object',
    "extendedData.payer":'required_if:type,TRANSFER_INCOMING|string',
    "extendedData.payee":'required_if:type,TRANSFER_OUTCOMING|string',
    "extendedData.extensionUType":['string','regex:/^x2p101Payload$/'],
    "extendedData.x2p101Payload":['object','required_if:extendedData.extensionUType,x2p101Payload'],
    "extendedData.x2p101Payload.extendedDescription":['string','required_if:extendedData.extensionUType,x2p101Payload'],
    "extendedData.x2p101Payload.endToEndId":['string'],
    "extendedData.x2p101Payload.purposeCode":['string'],
    "extendedData.service":['required','string','regex:/^X2P1.01$/'],
}

const accountDataRules = {
    "accountId": ['required','ASCIIString'],
    "creationDate": ['DateString'],
    "displayName": 'required|string',
    "nickName":'string',
    "openStatus":['string','regex:/^(OPEN|CLOSED)$/'],
    "isOwned":'required|boolean',
    "maskedNumber": ['required','MaskedAccountString'],
    "productCategory": ['required','regex:/^(TRANS_AND_SAVINGS_ACCOUNTS|TERM_DEPOSITS|TRAVEL_CARDS|REGULATED_TRUST_ACCOUNTS|RESIDENTIAL_MORTGAGES|CRED_AND_CHRG_CARDS|PERS_LOANS|MARGIN_LOANS|LEASES|TRADE_FINANCE|OVERDRAFTS|BUSINESS_LOANS)$/'],
    "productName": 'required|string'
}

const Tests = (async(env:E2ETestEnvironment) => {

    function Scenario(testFnDefiner: (testDefFn:(scenarioId:string) => [string,() => Promise<any>]) => Mocha.Test, persona: string | undefined, description?: string | undefined) {
        return ScenarioBase(testFnDefiner,persona,env,description)
    }


    const ApiSymbols = {
        contexts: {
            GetAccounts: Symbol.for("GetAccounts"),
            GetAllAccounts: Symbol.for("GetAllAccounts"),
            AllTransactions: Symbol.for("AllTransactions"),
            AllTransactionsBackward: Symbol.for("AllTransactionsBackward"),
            AllTransactionsRegularPagination: Symbol.for("AllTransactionsRegularPagination"),
            GetCustomer: Symbol.for("GetCustomer"),            
            TS_224: Symbol.for("TS_224"),
            TS_240: Symbol.for("TS_240"),
            TS_208: Symbol.for("TS_208"),
            TransactionDetail: Symbol.for("TransactionDetail")
        }
    }

    // const {TestData, CreateAssertion, CreateAssertionWithoutKey, AdrGatewayConfig} = await GenerateTestData(env)
    const TestData = async () => (await GenerateTestData(env)).TestData

    const GetAccountsOptions = async (ctx:TestContext) => {
        try {
            let options = {
                method: "GET",
                responseType:"json",
                key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                headers:{
                    "x-v":"1",
                    "Accept":"application/json",
                    "Content-Type":"application/json",
                    "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                    Authorization: `Bearer ${(await ctx.GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
                },
                url: urljoin((await TestData()).dataHolder.resourceEndpoint,"cds-au/v1/banking/accounts?product-category=TRANS_AND_SAVINGS_ACCOUNTS&open-status=OPEN&is-owned=true"),
            }
            return options;    
        } catch (err) {
            throw err
        }
    }
    
    const GetAllAccountsOptions = async (ctx:TestContext) => {
        try {
            let options = {
                method: "GET",
                responseType:"json",
                key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                headers:{
                    "x-v":"1",
                    "Accept":"application/json",
                    "Content-Type":"application/json",
                    "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                    Authorization: `Bearer ${(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken}`
                },
                url: urljoin((await TestData()).dataHolder.resourceEndpoint,"cds-au/v1/banking/accounts"),
            }
            return options;    
        } catch (err) {
            throw err
        }
    }

    const AllTransactionsOptions = async (ctx:TestContext,accountId:string, pageSize=500) => ({
        method: "GET",
        responseType:"json",
        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
        headers:{
            "x-v":"1",
            "Accept":"application/json",
            "Content-Type":"application/json",
            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
            "x-fapi-interaction-id":uuid.v4(),
            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
        },
        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts",accountId,"transactions"),
        params: {
            "oldest-time": moment(TestBoundaries["oldest-time"]).subtract(1,'year').toISOString(),
            "page-size": pageSize
        }
    })

    const BalancesOptions = async (ctx:TestContext,accountIds:string[], pageSize=500, headerOverride?:any) => {
        let options = {
            method: "POST",
            responseType:"json",
            key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
            cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
            ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
            passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
            headers:{
                "x-v":"1",
                "Accept":"application/json",
                "Content-Type":"application/json",
                "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                "x-fapi-interaction-id":uuid.v4(),
                Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
            },
            url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts/balances"),
            data: {
                data: {
                    accountIds
                }
            }
        }
        options.headers = _.merge(options.headers,headerOverride)
        return options;
    }

    const BulkBalancesOptions = async (ctx:TestContext,queryParameters:Dictionary<string>, pageSize=500) => ({
        method: "GET",
        responseType:"json",
        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
        headers:{
            "x-v":"1",
            "Accept":"application/json",
            "Content-Type":"application/json",
            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
            "x-fapi-interaction-id":uuid.v4(),
            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
        },
        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts/balances"),
        params: queryParameters
    })

    const BalanceOptions = async (ctx:TestContext,accountId:string) => ({
        method: "GET",
        responseType:"json",
        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
        headers:{
            "x-v":"1",
            "Accept":"application/json",
            "Content-Type":"application/json",
            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
            "x-fapi-interaction-id":uuid.v4(),
            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
        },
        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts/",accountId,"/balance"),
    })

    const TransactionDetailOptions = async (ctx:TestContext,accountId:string,transactionId:string) => ({
        method: "GET",
        responseType:"json",
        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
        headers:{
            "x-v":"1",
            "Accept":"application/json",
            "Content-Type":"application/json",
            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
            "x-fapi-interaction-id":uuid.v4(),
            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
        },
        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts/",accountId,"transactions",transactionId),
    })


    describe('API Tests', async () => {
        describe('Get Customer', async () => {

            Scenario($ => it.apply(this,$('TS_288')), 'John', 'Basic information on the customer who has authorised the current session is returned by DH')
                .Given('Existing consent')
                .PreTask(GatewayConsentWithCurrentAccessToken,async () => (await TestData()).defaults.consentParams)
                .When(DoRequest, async (ctx) => {
                    let options = DoRequest.Options({
                        method: "GET",
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        headers:{
                            "x-v":"1",
                            "Accept":"application/json",
                            "Content-Type":"application/json",
                            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                            "x-fapi-interaction-id":uuid.v4(),
                            Authorization: `Bearer ${(await ctx.GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
                        },
                        url: (await TestData()).dataHolder.resourceEndpoint+"/cds-au/v1/common/customer",
                    });
                    return options;
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let body = requestResult.body;
                    
                    expect(requestResult.response.status).to.equal(200);
                    // expect(body.data.customerUType).to.be.equal("person");
                    // expect(body.data.person.lastName).to.be.a('string')
                    // expect(Array.isArray(body.data.person.middleNames)).to.be.true;

                    let validation = new Validator({customer:body.data},customerRules)
                    if (validation.fails()) {
                        throw validation.errors;
                    }    

                },120).Keep(ApiSymbols.contexts.GetCustomer)

            Scenario($ => it.apply(this,$('TS_291')), undefined, 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('DR sends "x-fapi-interaction-id" in the request as a string value')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.GetCustomer).GetResult(DoRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.GetCustomer).GetLastHttpRequest("GET",/common\/customer/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                },120)

        })

        describe('Get Accounts', async () => {
            Scenario($ => it.apply(this,$('TS_197')), 'John', 'Verify the GetAccounts endpoint operates under happy-path scenario')
                .Given('Existing consent')
                .PreTask(GatewayConsentWithCurrentAccessToken,async () => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read","bank:accounts.detail:read"],
                    sharingDuration: 86400,
                    systemId: "test_ui",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(DoRequest, async (ctx) => DoRequest.Options(<any>await GetAccountsOptions(ctx)),"Request")
                .When(SetValue,async (ctx) => {
                    let req:DoRequestResult = await ctx.GetResult(DoRequest,"Request");
                    return req.body.data.accounts
                },"AccountList")
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest,"Request"));
                    // Expect the result of the "Do/Measure" to error code
                    let accountsObject = requestResult.response.data;
                    
                    expect(requestResult.response.status).to.equal(200);
                    expect(Array.isArray(accountsObject.data.accounts)).to.be.true;

                    for (let account of accountsObject.data.accounts) {
                        let validation = new Validator(account,accountDataRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }        
                    }

                },120).Keep(ApiSymbols.contexts.GetAccounts)

            Scenario($ => it.apply(this,$('Get all accounts')), undefined, 'Get all accounts for subsequent tests')
                .Given('Existing consent')
                .PreTask(NewGatewayConsent,async () => ({
                    cdrScopes: ["bank:accounts.basic:read","bank:transactions:read","bank:accounts.detail:read"],
                    sharingDuration: 86400,
                    systemId: "test_ui",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(DoRequest, async (ctx) => DoRequest.Options(<any>await GetAllAccountsOptions(ctx)),"Request")
                .When(SetValue,async (ctx) => {
                    let req:DoRequestResult = await ctx.GetResult(DoRequest,"Request");
                    return req.body.data.accounts
                },"AccountList")
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest,"Request"));
                    // Expect the result of the "Do/Measure" to error code
                    let accountsObject = requestResult.response.data;
                    
                    expect(requestResult.response.status).to.equal(200);
                    expect(Array.isArray(accountsObject.data.accounts)).to.be.true;
    
                    for (let account of accountsObject.data.accounts) {
                        let validation = new Validator(account,accountDataRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }        
                    }
    
                },120).Keep(ApiSymbols.contexts.GetAllAccounts)
        })




        describe('Error codes', async () => {

            Scenario($ => it.apply(this,$('TS_309')), undefined, '401 when invalid authorisation credentials are sent in the request')
                .Given('Existing consent')
                .PreTask(GatewayConsentWithCurrentAccessToken,async () => ({
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "test_ui",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .When(DoRequest, async (ctx) => {
                    let options = DoRequest.Options(<any>await GetAccountsOptions(ctx));
                    options.requestOptions.headers['Authorization'] = 'Bearer invalid-token'
                    return options;
                },"Request")
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest,"Request"));
                    // Expect the result of the "Do/Measure" to error code
                    
                    expect(requestResult.response.status).to.equal(401);
                },120)

            Scenario($ => it.apply(this,$('TS_310')), undefined, '403 when invalid authorisation scope is sent in the request')
                .Given('NConsent without transactions scope')
                .PreTask(NewGatewayConsent,async () => ({ // Get a new consent because we want to avoid getting a consent with the transactions scope
                    cdrScopes: ["bank:accounts.basic:read"],
                    sharingDuration: 86400,
                    systemId: "test_ui",
                    userId: "user-12345",
                    dataholderBrandId: (await TestData()).dataHolder.id
                }))
                .PreTask(DoRequest, async (ctx) => {
                    let options = {
                        method: "GET",
                        responseType:"json",
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        headers:{
                            "x-v":"1",
                            "Accept":"application/json",
                            "Content-Type":"application/json",
                            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                            Authorization: `Bearer ${(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken}`
                        },
                        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"cds-au/v1/banking/accounts?product-category=TRANS_AND_SAVINGS_ACCOUNTS&open-status=OPEN&is-owned=true"),
                    }
                    return DoRequest.Options(<any>options);
                },"Accounts")
                .When(DoRequest, async (ctx) => {
                    let accountsResponse = await ctx.GetResult(DoRequest,"Accounts")
                    let accounts = accountsResponse.body.data.accounts
                    if (accounts.length < 1) throw 'No accounts consented'

                    let options = DoRequest.Options(<any>{
                        method: "GET",
                        responseType:"json",
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        headers:{
                            "x-v":"1",
                            "Accept":"application/json",
                            "Content-Type":"application/json",
                            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                            "x-fapi-interaction-id":uuid.v4(),
                            Authorization: `Bearer ${(await ctx.GetResult(NewGatewayConsent)).consent!.accessToken}`
                        },
                        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts",accounts[0].accountId,"transactions"),
                        params: {
                            "oldest-time": moment(TestBoundaries["oldest-time"]).subtract(1,'year').toISOString(),
                        }
                    });
                    return options;
                },"Request")
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest,"Request"));

                    // TODO update expectation to match standard documentation (403 only)
                    expect(requestResult.response.status).to.satisfy(m => m == 403 || m == 401,'4xx level error code');
                },120)

            Scenario($ => it.apply(this,$('TS_311')), undefined, "An error '406 Not Acceptable' is returned by the DH")
                .Given('Invalid header values are sent in the request which are not supported by the DH')
                .Precondition('Account endpoint is working', async ctx => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'ApiSymbols.contexts.GetAccounts will not pass. Must pass for this test result to be valid.'
                    ctx.kv.accountIds = [accounts[0].accountId];

                })
                .PreTask(DoRequest, async (ctx) => DoRequest.Options(<any>await BalancesOptions(ctx,[ctx.kv.accountIds],5,{"x-v":"5"})),"Unsupported x-v")
                .PreTask(DoRequest, async (ctx) => DoRequest.Options(<any>await BalancesOptions(ctx,[ctx.kv.accountIds],5,{"x-min-v":"0"})),"Unsupported x-min-v")
                .PreTask(DoRequest, async (ctx) => DoRequest.Options(<any>await BalancesOptions(ctx,[ctx.kv.accountIds],5,{"accept":"application/xml"})),"Unsupported accept")
                .When(DoRequest, async (ctx) => DoRequest.Options(<any>await BalancesOptions(ctx,[ctx.kv.accountIds],5,{"content-type":"application/xml"})),"Unsupported content-type")
                .Then(async ctx => {
                    let results = [
                        await (ctx.GetResult(DoRequest,"Unsupported x-v")),
                        await (ctx.GetResult(DoRequest,"Unsupported x-min-v")),
                        await (ctx.GetResult(DoRequest,"Unsupported accept")),
                        await (ctx.GetResult(DoRequest,"Unsupported content-type")),
                    ]
                    
                    for (let result of results) {
                        let accountsObject = result.response.data;
                        expect(result.response.status).to.equal(406);
                    }

                },120)
        })

        describe('Get Transactions For Account', async () => {
            Scenario($ => it.apply(this,$('TS_249')), 'John', 'Consumer consents for a A/C 1 and the DR sends a request for A/C 1')
                .Given('Existing consent')
                .When(DepaginateRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DepaginateRequest.Options(<any>await AllTransactionsOptions(ctx,accountId,5),0)
                })
                .Then(async ctx => {
                    let depaginateResult = await (ctx.GetResult(DepaginateRequest));

                    if (depaginateResult.error) throw depaginateResult.error;

                    // Expect the result of the "Do/Measure" to error code
                    let transactions = _.flatten(_.map(depaginateResult.dataValues, c => c.transactions));
                    for (let response of depaginateResult.responses) {
                        expect(response.status).to.equal(200);
                    }
                    expect(Array.isArray(transactions)).to.be.true;

                    for (let transaction of transactions) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120).Keep(ApiSymbols.contexts.AllTransactions)


            Scenario($ => it.apply(this,$('Backward pagination')), 'John', '')
                .Given('Forwards pagination already completed')
                .When(DepaginateRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    let forwardRun = ctx.GetTestContext(ApiSymbols.contexts.AllTransactions)
                    await forwardRun.GetResult(DepaginateRequest)

                    let lastRequest = forwardRun.GetLastHttpRequest("GET",/transactions/);
                    let lastUri = lastRequest.response?.data.links.last
                    let lastSelfUri = lastRequest.response?.data.links.last
                    if (typeof lastUri !== 'string' || lastUri.length === 0) throw 'Forward run is not consistent in regards to links.self and links.last'
                    if (lastUri != lastSelfUri) throw 'Self is not consistent'

                    let options = DepaginateRequest.Options(<any>await AllTransactionsOptions(ctx,accountId,5),0,"BACKWARDS")
                    options.requestOptions.url = lastUri;
                    return options
                })
                .Then(async ctx => {
                    let depaginateResult = await (ctx.GetResult(DepaginateRequest));

                    if (depaginateResult.error) throw depaginateResult.error;

                    let transactions = _.flatten(_.map(depaginateResult.dataValues, c => c.transactions));
                    for (let response of depaginateResult.responses) {
                        expect(response.status).to.equal(200);
                    }
                    expect(Array.isArray(transactions)).to.be.true;

                    for (let transaction of transactions) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }
                },120).Keep(ApiSymbols.contexts.AllTransactionsBackward)


            Scenario($ => it.apply(this,$('Regular pagination')), 'John', 'Following manually constructed links is consistent with getting all transactions')
                .Given('Forwards pagination already completed')
                .When(SetValue, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    let forwardRun = ctx.GetTestContext(ApiSymbols.contexts.AllTransactions)
                    await forwardRun.GetResult(DepaginateRequest)

                    let lastRequest = forwardRun.GetLastHttpRequest("GET",/transactions/);
                    let totalPages = lastRequest.response?.data?.meta?.totalPages
                    
                    if (typeof totalPages !== 'number') throw 'totalPages must be a number'
                    totalPages = Math.floor(totalPages);
                    
                    if (totalPages < 0) throw 'totalPages cannot be negative'
                    const pageNumbers = _.range(1,totalPages+1);

                    let resultPages = _.map(pageNumbers, async n => {
                        let options = await AllTransactionsOptions(ctx,accountId,5);
                        (<any>options.params).page = n.toString()
                        return axios.request(TransformMtlsOptions(<any>options))
                    })

                    let responses = await Promise.all(resultPages);
                    let dataValues = _.map(responses, r => r.data?.data)
                    return {dataValues}

                })
                .Then(async ctx => {
                    let depaginateResult:{dataValues:{transactions:any[]}[]} = (await (ctx.GetResult(SetValue))).value;

                    let transactions = _.flatten(_.map(depaginateResult.dataValues, c => c.transactions));
                    expect(Array.isArray(transactions)).to.be.true;

                    for (let transaction of transactions) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }
                },120).Keep(ApiSymbols.contexts.AllTransactionsRegularPagination)

            Scenario($ => it.apply(this,$('TS_253')), 'Joseph', 'Request for non-consent account returns 403')
                .Given('Consumer consents for A/C 1 and DR sends a request for A/C 2')
                .Precondition('Test data exists', async ctx => {
                    if (!ctx.environment.Config.TestData?.Personas?.Joseph?.NonConsentedAccountId) {
                        throw 'No NonConsentedAccountId defined for Joseph'
                    }
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAllAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options(<any>await AllTransactionsOptions(ctx, ctx.environment.Config.TestData?.Personas?.Joseph?.NonConsentedAccountId!))
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    let response = requestResult.response
                    // TODO update expectation to match standard documentation (403 only)
                    expect(response.status).to.satisfy(m => m == 403 || m == 401,'4xx level error code');
                },120).Keep("TS_253")


            Scenario($ => it.apply(this,$('TS_258')), 'John', 'Transactions filtered within date period consistent with client-side filtering')
                .Given('Existing consent')
                .Precondition("Contains transactions within and without the specifed time period", async ctx => {
                    let requestResult = await (ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let transactions = requestResult.Collate(dv => dv.transactions);
                    let clientFiltered = _.filter(transactions,t => moment(t.postingDateTime).isBetween(TestBoundaries["oldest-time"],TestBoundaries["newest-time"]))
                    if (clientFiltered.length == 0) {
                        throw "No test data within the specified period";
                    }
                    if (transactions.length - clientFiltered.length == 0) {
                        throw "No test data outside the specified period";
                    }
                    ctx.kv.clientFiltered = clientFiltered
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options({
                        method: "GET",
                        responseType:"json",
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        headers:{
                            "x-v":"1",
                            "Accept":"application/json",
                            "Content-Type":"application/json",
                            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
                        },
                        params: {
                            "oldest-time": TestBoundaries["oldest-time"],
                            "newest-time": TestBoundaries["newest-time"],
                            "page-size": 500
                        },
                        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts",accountId,"transactions")
                    })
                },"TransactionsWithinDates")
                .Then(async ctx => {
                    let serverFiltered = (await ctx.GetResult(DoRequest,"TransactionsWithinDates")).body.data.transactions;

                    let clientFiltered:any[] = ctx.kv.clientFiltered

                    console.log("Assert left (clientFiltered) is set-equivalent to right (serverFiltered)")
                    AssertUnorderedListEquivalence(clientFiltered,serverFiltered)

                    for (let transaction of serverFiltered) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }

                },120)


            Scenario($ => it.apply(this,$('TS_262')), 'John', 'Transactions filtered within min-max amount range consistent with client-side filtering')
                .Given('Existing consent')
                .Precondition("Contains transactions within and without the specifed amount limits", async ctx => {
                    let requestResult = await (ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let transactions = requestResult.Collate(dv => dv.transactions);
                    let clientFiltered = _.filter(transactions,t => parseFloat(t.amount) >= parseFloat(TestBoundaries["min-amount"]) && parseFloat(t.amount) <= parseFloat(TestBoundaries["max-amount"]))
                    // also filter the dates so we have a clear date range for comparsion
                    clientFiltered = _.filter(clientFiltered,t => moment(t.postingDateTime).isBetween(TestBoundaries["oldest-time"],TestBoundaries["newest-time"]))
                    if (clientFiltered.length == 0) {
                        throw "No test data within the specified period";
                    }
                    if (transactions.length - clientFiltered.length == 0) {
                        throw "No test data outside the specified period";
                    }
                    ctx.kv.clientFiltered = clientFiltered
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options({
                        method: "GET",
                        responseType:"json",
                        key:(await TestData()).dataHolder.clientKeyFiles.valid.key,
                        cert:(await TestData()).dataHolder.clientKeyFiles.valid.cert,
                        ca:(await TestData()).dataHolder.clientKeyFiles.valid.ca,
                        passphrase:(await TestData()).dataHolder.clientKeyFiles.valid.passphrase,
                        headers:{
                            "x-v":"1",
                            "Accept":"application/json",
                            "Content-Type":"application/json",
                            "x-fapi-auth-date":"2019-12-03T06:23:59.885Z",
                            Authorization: `Bearer ${(await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken)).consent!.accessToken}`
                        },
                        params: {
                            "oldest-time": TestBoundaries["oldest-time"],
                            "newest-time": TestBoundaries["newest-time"],
                            "min-amount": TestBoundaries["min-amount"],
                            "max-amount": TestBoundaries["max-amount"],
                            "page-size": 500
                        },
                        url: urljoin((await TestData()).dataHolder.resourceEndpoint,"/cds-au/v1/banking/accounts",accountId,"transactions")
                    })
                },"TransactionsWithinDates")
                .Then(async ctx => {
                    let serverFiltered = (await ctx.GetResult(DoRequest,"TransactionsWithinDates")).body.data.transactions;

                    let clientFiltered:any[] = ctx.kv.clientFiltered
                    
                    console.log("Assert left (clientFiltered) is set-equivalent to right (serverFiltered)")
                    AssertUnorderedListEquivalence(clientFiltered,serverFiltered)

                    for (let transaction of serverFiltered) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }

                },120)


            describe('TS_268', () => {
                Scenario($ => it.apply(this,$('TS_268 (Forwards)')), 'John', 'Pagination on a small result set with cursor link is consistent with client-side pagination (forwards)')
                    .Given('Existing consent')
                    .Precondition("No more than than 1000 responses for all transactions in date period", async ctx => {
        
                        let depaginateResult = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest));
                        let transactionsCollated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        if (transactionsCollated.length > 1000) throw `Too many transactions to simulate depagination`
        
                    })
                    .When(DoRequest, async (ctx) => {
                        let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                        if (accounts.length == 0) throw 'No accounts to get transactions from'
                        let accountId = accounts[0].accountId;
        
                        let transactionsCollated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        return DoRequest.Options(<any>await AllTransactionsOptions(ctx,accountId,1000))
                    })
                    .Then(async ctx => {
                        let transactionsDepaginated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        expect((await ctx.GetResult(DoRequest)).response.status).to.eq(200);
        
                        let transactionsAll:{transactionId:string}[] = (await ctx.GetResult(DoRequest)).body.data.transactions;
        
                        expect(Array.isArray(transactionsAll)).to.be.true;
                        expect(Array.isArray(transactionsDepaginated)).to.be.true;
                        expect(transactionsDepaginated.length).to.eq(transactionsAll.length)
        
                        console.log("Assert left (transactionsDepaginated) is set-equivalent to right (transactionsAll)")
                        AssertUnorderedListEquivalence(transactionsDepaginated,transactionsAll)

        
                        for (let transaction of transactionsDepaginated) {
                            let validation = new Validator(transaction,transactionRules)
                            if (validation.fails()) {
                                throw validation.errors;
                            }       
                        }
        
        
                    },120)

                Scenario($ => it.apply(this,$('TS_268 (Backwards)')), 'John', 'Pagination on a small result set with cursor link is consistent with client-side pagination (backwards)')
                    .Given('Existing consent')
                    .Precondition("No more than than 1000 responses for all transactions in date period", async ctx => {
        
                        let depaginateResult = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsBackward).GetResult(DepaginateRequest));
                        let transactionsCollated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsBackward).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        if (transactionsCollated.length > 1000) throw `Too many transactions to simulate depagination`
        
                    })
                    .When(DoRequest, async (ctx) => {
                        let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                        if (accounts.length == 0) throw 'No accounts to get transactions from'
                        let accountId = accounts[0].accountId;
        
                        let transactionsCollated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsBackward).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        return DoRequest.Options(<any>await AllTransactionsOptions(ctx,accountId,1000))
                    })
                    .Then(async ctx => {
                        let transactionsDepaginated:{transactionId:string}[] = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsBackward).GetResult(DepaginateRequest)).Collate(dv => dv.transactions)
        
                        expect((await ctx.GetResult(DoRequest)).response.status).to.eq(200);
        
                        let transactionsAll:{transactionId:string}[] = (await ctx.GetResult(DoRequest)).body.data.transactions;
        
                        expect(Array.isArray(transactionsAll)).to.be.true;
                        expect(Array.isArray(transactionsDepaginated)).to.be.true;

                        console.log("Assert left (transactionsDepaginated) is set-equivalent to right (transactionsAll)")
                        AssertUnorderedListEquivalence(transactionsDepaginated,transactionsAll)
            
                        for (let transaction of transactionsDepaginated) {
                            let validation = new Validator(transaction,transactionRules)
                            if (validation.fails()) {
                                throw validation.errors;
                            }       
                        }

                    },120)
            })

            Scenario($ => it.apply(this,$('TS_269')), 'John', 'Regular pagination is consistent with client-side pagination')
                .Given('Existing consent')
                .Precondition("No more than than 1000 responses for all transactions in date period", async ctx => {

                    let depaginateResult:{dataValues:{transactions:any[]}[]} = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsRegularPagination).GetResult(SetValue)).value;
                    let transactionsCollated:{transactionId:string}[] = _.flatten(_.map(depaginateResult.dataValues, dv => dv.transactions))

                    if (transactionsCollated.length > 1000) throw `Too many transactions to simulate depagination`

                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsRegularPagination).GetResult(SetValue)

                    return DoRequest.Options(<any>await AllTransactionsOptions(ctx,accountId,1000))
                })
                .Then(async ctx => {
                    let depaginateResult:{dataValues:{transactions:any[]}[]} = (await ctx.GetTestContext(ApiSymbols.contexts.AllTransactionsRegularPagination).GetResult(SetValue)).value;
                    let transactionsDepaginated:{transactionId:string}[] = _.flatten(_.map(depaginateResult.dataValues, dv => dv.transactions))

                    let transactionsAll:{transactionId:string}[] = (await ctx.GetResult(DoRequest)).body.data.transactions;

                    expect(Array.isArray(transactionsAll)).to.be.true;
                    expect(Array.isArray(transactionsDepaginated)).to.be.true;

                    console.log("Assert left (transactionsDepaginated) is set-equivalent to right (transactionsAll)")
                    AssertUnorderedListEquivalence(transactionsDepaginated,transactionsAll)

                    for (let transaction of transactionsDepaginated) {
                        let validation = new Validator(transaction,transactionRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }       
                    }

                },120)

            Scenario($ => it.apply(this,$('TS_273')), undefined, 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('DR sends "x-fapi-interaction-id" in the request as a string value')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetLastHttpRequest("GET",/accounts\/.*?\/transactions/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120)
        })

        describe('Get Transaction Detail', () => {
            Scenario($ => it.apply(this,$('TS_284')), 'David', 'DH Returns 403 for consented account id non-existing transaction ID')
                .Given('Consumer consents for A/C 1 and DR sends a request to DH1 with the correct A/C ID but incorrect Transaction ID.')
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")

                    if (accounts.length < 1) throw 'No accounts to test with';
                    ctx.kv.account = accounts[0];

                    return DoRequest.Options(<any>await TransactionDetailOptions(ctx,ctx.kv.account.accountId,'non-existing-transaction-id-123'))
                })
                .Then(async ctx => {
                    let res = await ctx.GetResult(DoRequest);
                    expect(res.response.status).to.equal(403);
                },120)

            Scenario($ => it.apply(this,$('TS_279')), 'Julia', 'The transaction detail of A/C 1 are returned by DH1')
                .Given('Consumer consents for A/C 1 and DR sends a request for A/C 1. The result of the GetTransactionForAccount API includes IsDetailAvailable=TRUE.')
                .Precondition('Tranasction exists with isDetailAvailable = true', async (ctx) => {
                    let requestResult = await (ctx.GetTestContext(ApiSymbols.contexts.AllTransactions).GetResult(DepaginateRequest));
                    // Expect the result of the "Do/Measure" to error code
                    let transactions = requestResult.Collate(dv => dv.transactions);
                    // find a transaction that has detail
                    let transactionWithDetail = _.find(transactions,t => t.isDetailAvailable == true)
                    if (!transactionWithDetail) throw 'Could not find a transaction with isDetailAvailable = true'

                    ctx.kv.transactionPath = {
                        accountId: transactionWithDetail.accountId,
                        transactionId: transactionWithDetail.transactionId
                    }
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")

                    if (accounts.length < 1) throw 'No accounts to test with';
                    ctx.kv.account = accounts[0];

                    return DoRequest.Options(<any>await TransactionDetailOptions(ctx,ctx.kv.transactionPath.accountId,ctx.kv.transactionPath.transactionId))
                })
                .Then(async ctx => {
                    let res = await ctx.GetResult(DoRequest);
                    expect(res.response.status).to.equal(200);

                    let transaction = res.body.data;

                    let validation = new Validator(transaction,transactionRules)
                    if (validation.fails()) {
                        throw validation.errors;
                    }       

                    let detailValidation = new Validator(transaction,transactionDetailRules)
                    if (detailValidation.fails()) {
                        throw detailValidation.errors;
                    }       


                },120).Keep(ApiSymbols.contexts.TransactionDetail)

            Scenario($ => it.apply(this,$('TS_287')), undefined, 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('DR sends "x-fapi-interaction-id" in the request as a string value')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.TransactionDetail).GetResult(DoRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.TransactionDetail).GetLastHttpRequest("GET",/accounts\/.*?\/transactions\/.+/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120)


        })

        describe('Get Balances for Specific Accounts', () => {
            Scenario($ => it.apply(this,$('TS_224')), 'Jane', 'Consumer consents for A/C 1 and A/C 2 and DR sends a request for A/C 1 only')
                .Given('Existing consent')
                .When(DepaginateRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DepaginateRequest.Options(<any>await BalancesOptions(ctx,[accountId],5),0)
                })
                .Then(async ctx => {
                    let depaginateResult = await (ctx.GetResult(DepaginateRequest));

                    if (depaginateResult.error) throw depaginateResult.error;

                    // Expect the result of the "Do/Measure" to error code
                    let balances = _.flatten(_.map(depaginateResult.dataValues, c => c.balances));
                    for (let response of depaginateResult.responses) {
                        expect(response.status).to.equal(200);
                    }
                    expect(Array.isArray(balances)).to.be.true;

                    for (let balance of balances) {
                        let validation = new Validator(balance,balanceRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }    
                    }
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120).Keep(ApiSymbols.contexts.TS_224)

            Scenario($ => it.apply(this,$('TS_225')), 'Jane', 'A/C 1 becomes invalid due to fraud and DR sends a request for both A/C 1 and A/C 2')
                .Given('Existing consent')
                .Precondition('Test data exists', async ctx => {
                    if (!ctx.environment.Config.TestData?.Personas?.Jane?.InvalidAccountId) {
                        throw 'No InvalidAccountId defined for Jane'
                    }
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options(<any>await BalancesOptions(ctx,[accountId, ctx.environment.Config.TestData?.Personas?.Jane?.InvalidAccountId!],5))
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    let response = requestResult.response
                    expect(response.status).to.equal(422);
                    let errors:{
                        code:string,
                        title: string,
                        detail: string
                    }[] = response.data.errors;
                    console.log(errors)
                    let error = _.find(errors,e => e.code.startsWith("0001") && e.title === 'Invalid account' && e.detail == ctx.environment.Config.TestData?.Personas?.Jane?.InvalidAccountId!)

                    expect(error).to.not.be.undefined
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120).Keep("TS_225")

            Scenario($ => it.apply(this,$('TS_236')), 'Jane', 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('Existing consent')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.TS_224).GetResult(DepaginateRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.TS_224).GetLastHttpRequest("POST",/accounts\/balances/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120)
        })

        describe('Get Bulk Balances', () => {
            Scenario($ => it.apply(this,$('TS_208')), 'John', 'Balance returned by DH for A/C 1')
                .Given('Consumer consents for A/C 1 and DR sends a request')
                .Precondition('Accounts match persona', async ctx => {
                   let accounts:{accountId:string, productCategory:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                   if (accounts.length < 1) {
                       throw "Expected at least one account"
                   }
                   if (accounts[0].productCategory != 'TRANS_AND_SAVINGS_ACCOUNTS') throw 'Expected product-category == TRANS_AND_SAVINGS_ACCOUNTS'
                   ctx.kv.expectedAccountId = accounts[0].accountId
                })
                .When(DepaginateRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DepaginateRequest.Options(<any>await BulkBalancesOptions(ctx,{"product-category":"TRANS_AND_SAVINGS_ACCOUNTS"},5),0)
                })
                .Then(async ctx => {
                    let depaginateResult = await (ctx.GetResult(DepaginateRequest));

                    if (depaginateResult.error) throw depaginateResult.error;

                    // Expect the result of the "Do/Measure" to error code
                    let balances = _.flatten(_.map(depaginateResult.dataValues, c => c.balances));
                    for (let response of depaginateResult.responses) {
                        expect(response.status).to.equal(200);
                    }
                    expect(Array.isArray(balances)).to.be.true;

                    expect(balances.length).to.at.least(1);
                    expect(balances[0].accountId).to.eq(ctx.kv.expectedAccountId);

                    for (let balance of balances) {
                        let validation = new Validator(balance,balanceRules)
                        if (validation.fails()) {
                            throw validation.errors;
                        }
                    }
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120).Keep(ApiSymbols.contexts.TS_208)

            Scenario($ => it.apply(this,$('TS_210')), 'Julia', '"200 Success" returned by DH, with no accounts listed. Note: Payload must not be empty.')
                .Given('Consumer consents for A/C 1 in product category TRANS_AND_SAVINGS_ACCOUNTS and DR sends a request for TERM_DEPOSITS')
                .Precondition('Accounts match persona', async ctx => {
                    let accounts:{accountId:string, productCategory:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length < 2) {
                        throw "Expected at least two accounts"
                    }
                    for (let account of accounts) {
                        if (account.productCategory != 'TRANS_AND_SAVINGS_ACCOUNTS') throw `Expected ${account.accountId} product-category == TRANS_AND_SAVINGS_ACCOUNTS`
                    }
                 })
                 .When(DepaginateRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DepaginateRequest.Options(<any>await BulkBalancesOptions(ctx,{"product-category":"TERM_DEPOSITS"},5),0)
                })
                .Then(async ctx => {
                    let depaginateResult = await (ctx.GetResult(DepaginateRequest));

                    if (depaginateResult.error) throw depaginateResult.error;

                    // Expect the result of the "Do/Measure" to error code
                    let balances = _.flatten(_.map(depaginateResult.dataValues, c => c.balances));
                    for (let response of depaginateResult.responses) {
                        expect(response.status).to.equal(200);
                    }
                    expect(Array.isArray(balances)).to.be.true;

                    expect(balances.length).to.eq(0);
                },120).Keep("TS_210")

            Scenario($ => it.apply(this,$('TS_218')), 'Jane', 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('Existing consent')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.TS_208).GetResult(DepaginateRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.TS_208).GetLastHttpRequest("GET",/accounts\/balances/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120)
        })

        describe('Get Account Balance', () => {
            Scenario($ => it.apply(this,$('TS_240')), 'Julia', 'DH returns the balances for A/C 1')
                .Given('Consumer consents for A/C 1 and DR sends the request for the correct account')
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options(<any>await BalanceOptions(ctx,accountId))
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    if (requestResult.error) throw requestResult.error;

                    // Expect the result of the "Do/Measure" to error code
                    let balance = requestResult.body.data;
                    expect(requestResult.response.status).to.equal(200);
                    expect(balance).to.not.be.undefined;

                    let validation = new Validator(balance,balanceRules)
                    if (validation.fails()) {
                        throw validation.errors;
                    }    
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120).Keep(ApiSymbols.contexts.TS_240)

            Scenario($ => it.apply(this,$('TS_245')), 'Donna', 'Request for non-consent account returns 403')
                .Given('Consumer consents for A/C 1 and A/C 2 for Product category as TRANS_AND_SAVINGS_ACCOUNTS and DR sends a request for A/C 3t')
                .Precondition('Test data exists', async ctx => {
                    if (!ctx.environment.Config.TestData?.Personas?.Donna?.NonConsentedAccountId) {
                        throw 'No NonConsentedAccountId defined for Donna'
                    }
                })
                .When(DoRequest, async (ctx) => {
                    let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                    if (accounts.length == 0) throw 'No accounts to get transactions from'
                    let accountId = accounts[0].accountId;

                    return DoRequest.Options(<any>await BalanceOptions(ctx, ctx.environment.Config.TestData?.Personas?.Donna?.NonConsentedAccountId!))
                })
                .Then(async ctx => {
                    let requestResult = await (ctx.GetResult(DoRequest));

                    let response = requestResult.response
                    expect(response.status).to.equal(403);
                },120).Keep("TS_245")

            Scenario($ => it.apply(this,$('TS_248')), 'Julia', 'DH must return this string value in the "x-fapi-interaction-id" response header.')
                .Given('Existing consent')
                .When(SetValue, async (ctx) => {
                    await ctx.GetTestContext(ApiSymbols.contexts.TS_240).GetResult(DoRequest)
                    let httpEntry = ctx.GetTestContext(ApiSymbols.contexts.TS_240).GetLastHttpRequest("GET",/accounts\/[^\/]+\/balance/);

                    let sent = httpEntry.config.headers['x-fapi-interaction-id'];
                    let received = httpEntry.response?.headers['x-fapi-interaction-id'];
                    return {
                        sent, received
                    }

                })
                .Then(async ctx => {
                    let {sent, received} = (await ctx.GetResult(SetValue)).value

                    expect(sent).to.be.a('string').and.not.empty
                    expect(received).to.be.a('string').and.not.empty
                    expect(sent).to.eq(received)
                    //expect(oidcConfig.response_types_supported).to.contain("code id_token");
                },120)
    
        })


    })

    const customerNotPresentHeaders = {
        "x-adrgw-present": false,
        "x-adrgw-last-authenticated": moment().subtract(1,'hour').toISOString()
    }

    describe('Resource Proxies', async () => {
        Scenario($ => it.apply(this,$('Accounts Proxy')), '', 'Forwards request to DH, self link returns the same result')
            .Given('Existing consent')
            .PreTask(GatewayConsentWithCurrentAccessToken,async () => ({
                cdrScopes: ["bank:accounts.basic:read"],
                sharingDuration: 86400,
                systemId: "test_ui",
                userId: "user-12345",
                dataholderBrandId: (await TestData()).dataHolder.id
            }))
            .When(DoRequest, async ctx => {
                let consent = await ctx.GetResult(GatewayConsentWithCurrentAccessToken);
                return DoRequest.Options({
                    responseType:"json",
                    headers: customerNotPresentHeaders,
                    url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts")
                })
            })
            .Then(async ctx => {
                let result = await ctx.GetResult(DoRequest);
                let selfUrl:string = result.body.links.self;
                let selfResponse = await axios.request({url:selfUrl,headers:customerNotPresentHeaders,responseType:"json"});
                expect(selfResponse.status).to.equal(200)
                expect(selfResponse.data.data.accounts).to.not.be.undefined;
                expect(_.isEqual(selfResponse.data,result.body)).to.be.true;
                expect(result.response.status).to.equal(200)
            },120)        

        Scenario($ => it.apply(this,$('Bulk Balances Proxy')), '', 'Forwards request to DH, self link returns the same result')
            .Given('Existing consent')
            .PreTask(GatewayConsentWithCurrentAccessToken,async () => ({
                cdrScopes: ["bank:accounts.basic:read"],
                sharingDuration: 86400,
                systemId: "test_ui",
                userId: "user-12345",
                dataholderBrandId: (await TestData()).dataHolder.id
            }))
            .When(DoRequest, async ctx => {
                let consent = await ctx.GetResult(GatewayConsentWithCurrentAccessToken);
                return DoRequest.Options({
                    responseType:"json",
                    headers: customerNotPresentHeaders,
                    url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts/balances")
                })
            })
            .Then(async ctx => {
                let result = await ctx.GetResult(DoRequest);
                let selfUrl:string = result.body.links.self;
                let selfResponse = await axios.request({url:selfUrl,headers:customerNotPresentHeaders,responseType:"json"});
                expect(selfResponse.status).to.equal(200)
                expect(selfResponse.data.data.balances).to.not.be.undefined;
                expect(_.isEqual(selfResponse.data,result.body)).to.be.true;
                expect(result.response.status).to.equal(200)
            },120)        

        Scenario($ => it.apply(this,$('Transactions Proxy')), '', 'Forwards request to DH, self link returns the same result')
            .Given('Existing consent and accounts response')
            .When(DoRequest, async ctx => {
                let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                let firstAccount = accounts[0];
                if (!firstAccount) throw 'No accounts for which to receive transactions'

                let consent = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken);
                return DoRequest.Options({
                    responseType:"json",
                    headers: customerNotPresentHeaders,
                    url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts",firstAccount.accountId,"transactions")
                })
            })
            .Then(async ctx => {
                let result = await ctx.GetResult(DoRequest);
                let selfUrl:string = result.body.links.self;
                let selfResponse = await axios.request({url:selfUrl,headers:customerNotPresentHeaders,responseType:"json"});
                expect(selfResponse.status).to.equal(200)
                expect(selfResponse.data.data.transactions).to.not.be.undefined;
                expect(_.isEqual(selfResponse.data,result.body)).to.be.true;
                expect(result.response.status).to.equal(200)
            },120)        

        Scenario($ => it.apply(this,$('Account Balance Proxy')), '', 'Forwards request to DH, self link returns the same result')
            .Given('Existing consent and accounts response')
            .When(DoRequest, async ctx => {
                let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                let firstAccount = accounts[0];
                if (!firstAccount) throw 'No accounts for which to receive balance'

                let consent = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken);
                return DoRequest.Options({
                    responseType:"json",
                    headers: customerNotPresentHeaders,
                    url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts",firstAccount.accountId,"balance")
                })
            })
            .Then(async ctx => {
                let result = await ctx.GetResult(DoRequest);
                let selfUrl:string = result.body.links.self;
                let selfResponse = await axios.request({url:selfUrl,headers:customerNotPresentHeaders,responseType:"json"});
                expect(selfResponse.status).to.equal(200)
                expect(selfResponse.data.data).to.not.be.undefined;
                expect(_.isEqual(selfResponse.data,result.body)).to.be.true;
                expect(result.response.status).to.equal(200)
            },120)        

        Scenario($ => it.apply(this,$('Account Detail Proxy')), '', 'Forwards request to DH, self link returns the same result')
            .Given('Existing consent and accounts response')
            .When(DoRequest, async ctx => {
                let accounts:{accountId:string}[] = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetValue("AccountList")
                let firstAccount = accounts[0];
                if (!firstAccount) throw 'No accounts for which to receive details'

                let consent = await ctx.GetTestContext(ApiSymbols.contexts.GetAccounts).GetResult(GatewayConsentWithCurrentAccessToken);
                return DoRequest.Options({
                    responseType:"json",
                    headers: customerNotPresentHeaders,
                    url: urljoin(env.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",consent.consent!.id.toString(),"accounts",firstAccount.accountId)
                })
            })
            .Then(async ctx => {
                let result = await ctx.GetResult(DoRequest);
                let selfUrl:string = result.body.links.self;
                let selfResponse = await axios.request({url:selfUrl,headers:customerNotPresentHeaders,responseType:"json"});
                expect(selfResponse.status).to.equal(200)
                expect(selfResponse.data.data).to.not.be.undefined;
                expect(_.isEqual(selfResponse.data,result.body)).to.be.true;
                expect(result.response.status).to.equal(200)
            },120)        


    })
})

export {Tests}
