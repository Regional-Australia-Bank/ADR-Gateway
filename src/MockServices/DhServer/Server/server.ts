import "reflect-metadata";

const Entities = require('html-entities').AllHtmlEntities;
 
const entities = new Entities();

import express from "express";
import { JWKS, JSONWebKeySet } from "jose";
import { MTLSVerificationMiddleware } from "../../../Common/Server/Middleware/MTLSVerification"
import { GatewayRequest, GatewayContext } from "../../../Common/Server/Types";
import { CDSVersionComplianceMiddleware } from "../../../Common/Server/Middleware/CDSVersionCompliance";
import { injectable, inject } from "tsyringe";
import base64url from 'base64url';
import winston from "winston";
import { ConsentManager } from "../Entities/Consent";
import bodyParser, { urlencoded } from "body-parser"
import { OIDCConfiguration, DhServerConfig } from "./Config";
import { Authorize, AuthorizeMiddleware } from "./Handlers/Authorize";
import { testAccountList, testTransactionList, testBalanceList, testAccountDetailList, testCustomer, AccountConsentStatus, TransactionDetail, GetTransactions } from "../TestData/ResourceData";
import { HokBoundTokenScopeVerificationFactory } from "./Middleware/OAuth2ScopeAuth";
import { CdsScope } from "../../../Common/SecurityProfile/Scope";
import { container } from "../DhDiContainer";
import { GrantConsentMiddleware } from "./Handlers/GrantConsent";
import { UserInfoMiddleware } from "./Handlers/UserInfo";
import { PaginationMiddleware, MockDataArray, MockDataObject } from "../../../Common/Server/Middleware/Pagination";
import { ClientRegistrationMiddleware } from "./Handlers/ClientRegistration";
import moment from "moment"
import { ClientAccessTokenMiddleware } from "./Handlers/ClientAccessToken";
import { GetClientRegistrationMiddleware } from "./Handlers/GetClientRegistration";
import { UpdateClientRegistrationMiddleware } from "./Handlers/UpdateClientRegistration";
import { MetadataUpdater } from "./Helpers/MetadataUpdater";
import { SendOAuthError } from "./Helpers/OAuthFlowError";
import _ from "lodash"
import { TokenIntrospectionMiddleware } from "./Handlers/TokenIntrospection";
import { ClientBearerJwtVerificationMiddleware } from "../../../Common/Server/Middleware/CdsClientBearerJwtVerification";
import { EcosystemMetadata } from "./Helpers/EcosystemMetadata";
import { TokenRevocationMiddleware } from "./Handlers/TokenRevocation";
import { DhGatewayRequest } from "./Types";
import urljoin from "url-join";
import { PushedAuthorizationRequestMiddleware } from "./Handlers/PushedAuthorizationRequest";
import { DeleteArrangementMiddleware } from "./Handlers/DeleteArrangement";

@injectable()
class DhServer {
    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("PrivateKeystore") private privateKeystore: () => Promise<JWKS.KeyStore>,
        @inject("OIDCConfiguration") private oidcConfig: (cfg:DhServerConfig) => OIDCConfiguration,
        @inject("DhServerConfig") private config:() => Promise<DhServerConfig>,
        @inject("EcosystemMetadata") private ecosystemMetadata:EcosystemMetadata,
        @inject("CdrRegisterKeystoreProvider") private getRegisterKeystore: () => Promise<JSONWebKeySet>,
        private paginationMiddleware:PaginationMiddleware
    ) { }

    async init(): Promise<any> {
        const app = express();

        app.use((req, res, next) => {
            (req as GatewayRequest).gatewayContext = {
                verifiedBearerJwtClientId: undefined,
                verifiedTokenHokClientId: undefined,
                authorizedClientId: undefined,
            };
            next();
        });

        app.get("/.well-known/openid-configuration", async (req, res) => {
            // output the public portion of the key

            res.setHeader("content-type", "application/json");
            res.send(this.oidcConfig(await this.config()));

        });

        app.post("/idp/register", container.resolve(ClientRegistrationMiddleware).handler());
        app.get("/idp/register/:clientId", await container.resolve(GetClientRegistrationMiddleware).handler());
        app.put("/idp/register/:clientId", container.resolve(UpdateClientRegistrationMiddleware).handler());

        // TODO bind this endpoint to MTLS
        // TODO change to x-www-form-urlencded
        app.post("/idp/token",
            container.resolve(MTLSVerificationMiddleware).handle,
            container.resolve(ClientAccessTokenMiddleware).handler()
        );

        app.post("/idp/token/introspect",
            container.resolve(MTLSVerificationMiddleware).handle,
            container.resolve(TokenIntrospectionMiddleware).handler()
        );

        app.post("/idp/arrangement",
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate
            container.resolve(DeleteArrangementMiddleware).handler()
        );

        app.post("/idp/token/revoke",
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate
            container.resolve(TokenRevocationMiddleware).handler()
        );

        app.post("/par",
            container.resolve(MTLSVerificationMiddleware).handle,
            container.resolve(PushedAuthorizationRequestMiddleware).handler()
        );
        
        app.get("/authorize", container.resolve(AuthorizeMiddleware).handler({isPost:false})); // GET, POST
        app.post("/authorize", container.resolve(AuthorizeMiddleware).handler({isPost:true})); // GET, POST
        app.patch('/authorize',container.resolve(GrantConsentMiddleware).handler())

        app.post("/register"); // POST

        app.get("/jwks", async (req, res) => {
            // output the public portion of the key

            res.setHeader("content-type", "application/json");
            res.send((await this.privateKeystore()).toJWKS());
            this.logger.info("Someone requested JWKS")

        });

        app.post("/admin/register/metadata",
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate
            container.resolve(ClientBearerJwtVerificationMiddleware).handler(() => ({
                GetWithHealing: async () => JWKS.asKeyStore(await this.getRegisterKeystore())
            }),"cdr-register"), // verify Bearer JWT and check JWT ~ client cert. Returns 401 on conflicting creds, and 403 on wrong permissions.
            container.resolve(CDSVersionComplianceMiddleware).handle,
            async (req, res) => {
                try {
                    let metadataUpdater = container.resolve(MetadataUpdater);
                    this.logger.info("Received metadata update request from CDR")
                    let entry = await metadataUpdater.log();
                    // write metadata update to database
                    res.send();
                } catch (err) {
                    this.logger.error(err);
                    res.sendStatus(500);
                }
            }
        );


        app.get(
            '/cds-au/v1/banking/accounts',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankAccountsBasicRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataArray(() => testAccountList),
            this.paginationMiddleware.Paginate({baseUrl: '/cds-au/v1/banking/accounts',dataObjectName:"accounts", mtls:true}));

        app.get(
            '/cds-au/v1/banking/accounts/balances',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankAccountsBasicRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataArray((req:express.Request) => {
                let balances = _.filter(testBalanceList, b => {
                    let matchingAccount = _.find(testAccountDetailList,x => x.accountId === b.accountId);
                    if (typeof matchingAccount === 'undefined') throw 'Cannot find account detail to match balance'
                    if (typeof req.query["product-category"] === 'string') {
                        if (matchingAccount.productCategory !== req.query["product-category"]) return false;
                    }
                    return true
                })

                return balances;
            }),
            this.paginationMiddleware.Paginate({baseUrl: '/cds-au/v1/banking/accounts/balances',dataObjectName:"balances",  mtls:true}));
    
        app.post(
            '/cds-au/v1/banking/accounts/balances',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankAccountsBasicRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            bodyParser.json(),
            MockDataArray((req:express.Request) => {
                let balances = _.filter(testBalanceList, b => {
                    if (!_.find(req.body.data.accountIds, a => {
                        if (a !== b.accountId) return false
                        let matchingAccount = _.find(testAccountDetailList,x => x.accountId === b.accountId);
                        if (typeof matchingAccount === 'undefined') throw 'Cannot find account detail to match balance'
                        if (typeof req.query["product-category"] === 'string') {
                            if (matchingAccount.productCategory !== req.query["product-category"]) return false;
                        }
                        return true
                    })) {
                        return false;
                    }

                    return true;
                })
                let balanceAccountIds = _.map(balances,b => b.accountId);
                let missingAccountIds = _.difference(req.body.data.accountIds,balanceAccountIds)
                if (missingAccountIds.length>0) {
                    throw {missingAccountIds};
                }

                return balances;
            }),
            this.paginationMiddleware.Paginate({baseUrl: '/cds-au/v1/banking/accounts/balances',dataObjectName:"balances", mtls:true}));

        app.get(
            '/cds-au/v1/banking/accounts/:accountId/balance',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankAccountsBasicRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataObject((req) => _.find(testBalanceList,b => {
                if (b.accountId !== req.params.accountId) return false;
                let account = _.find(testAccountDetailList, acc => acc.accountId == b.accountId);
                if (!account) {
                    return false;
                };
                if (account.consentStatus == AccountConsentStatus.CONSENTED) {
                    return true;
                } else if (account.consentStatus == AccountConsentStatus.NOT_CONSENTED) {
                    throw {unconsentedAccount: true}
                } else {
                    throw {unsupportedStatus: account}
                }
            })),
            this.paginationMiddleware.MetaWrap({mtls:true,baseUrl: (req) => `/cds-au/v1/banking/accounts/${req.params.accountId}/balance`}));

        app.get(
            '/cds-au/v1/banking/accounts/:accountId',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankAccountsDetailRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataObject((req) => _.find(testAccountDetailList,b => b.accountId == req.params.accountId)),
            this.paginationMiddleware.MetaWrap({mtls:true,baseUrl: (req) => `/cds-au/v1/banking/accounts/${req.params.accountId}`}));
    
        app.get(
            '/cds-au/v1/common/customer',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.CommonCustomerBasicRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataObject(() => testCustomer),
            this.paginationMiddleware.MetaWrap({mtls:true,baseUrl: (req) => '/cds-au/v1/common/customer'}));
    

        app.get(
            '/cds-au/v1/banking/accounts/:accountId/transactions',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankTransactionsRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataArray((req) => {
                let consent = (<any>req as DhGatewayRequest).gatewayContext.consent;
                let filtered = _.filter(GetTransactions(consent.secretSubjectId,req.params.accountId), t => {
                    if (t.accountId !== req.params['accountId']) return false;
                    if (typeof req.query["oldest-time"] === 'string') { // TODO validate that all query parameters appear only once - otherwise this causes weird behaviours
                        if (!t.postingDateTime) return false;
                        if (moment(t.postingDateTime).isBefore(moment(req.query["oldest-time"]))) return false;
                    } else {
                        if (moment(t.postingDateTime).isBefore(moment().subtract(90,'days'))) return false;
                    }

                    if (typeof req.query["newest-time"] === 'string') {
                        if (!t.postingDateTime) return false;
                        if (moment(t.postingDateTime).isAfter(moment(req.query["newest-time"]))) return false;
                    }

                    if (typeof req.query["min-amount"] === 'string') {
                        if (parseFloat(t.amount) < parseFloat(req.query["min-amount"])) return false;
                    }

                    if (typeof req.query["max-amount"] === 'string') {
                        if (parseFloat(t.amount) > parseFloat(req.query["max-amount"])) return false;
                    }

                    return true;
                })
                return filtered;
            }),
            this.paginationMiddleware.Paginate({baseUrl: (req) => `/cds-au/v1/banking/accounts/${req.params.accountId}/transactions`,dataObjectName:"transactions", mtls:true}));
    
        app.get(
            '/cds-au/v1/banking/accounts/:accountId/transactions/:transactionId',
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate 
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.BankTransactionsRead).handler("Resource"),
            container.resolve(CDSVersionComplianceMiddleware).handle,
            MockDataObject((req,res) =>{
                let consent = (<any>req as DhGatewayRequest).gatewayContext.consent;
                return TransactionDetail(consent.secretSubjectId,req.params.accountId,req.params.transactionId);
            } ),
            this.paginationMiddleware.MetaWrap({baseUrl: (req) => `/cds-au/v1/banking/accounts/${req.params.accountId}/transactions`, mtls:true}))
    

        app.get( // TODO and POST
            // TODO CORS
            // TODO error response (5.3.3)
            // TODO claims parameter
            // TODO request object
            '/userinfo',
            // TODO reinstate security middleware
            container.resolve(MTLSVerificationMiddleware).handle, // Check MTLS Certificate
            container.resolve(HokBoundTokenScopeVerificationFactory).make(CdsScope.OpenID).handler("UserInfo"),
            container.resolve(UserInfoMiddleware).handler()
        )    

        app.get("/cds-au/v1/discovery/status",
            container.resolve(CDSVersionComplianceMiddleware).handle,
            async (req, res) => {
            // output the public portion of the key

            res.setHeader("content-type", "application/json");
            res.send({
                "data": {
                  "status": "OK",
                  "updateTime": moment().toISOString()
                },
                "links": {
                  "self": urljoin((await this.config()).FrontEndUrl,"cds-au/v1/discovery/status")
                }
              });

        });

        app.get('/authorize/consent-flow/:consentId', async (req, res) => {
            let consentManager = container.resolve(ConsentManager);
            let consent = await consentManager.GetById(parseInt(req.params.consentId))
            if (typeof consent =='undefined') return res.status(404).send();

            return res.contentType('html').send(`
                <html>
                <h1>Mock DH Consent flow</h1>
                <form method="POST">
                <h2>Confirm consent</h2>
                <input type="hidden" name="scopes" value="${entities.encode(consent.requestedScopesJson)}" />
                <input type="hidden" name="state" value="${entities.encode(consent.state)}" />
                <div><input type="text" name="userId" value="bank-customer-123456" /></div>
                <div><input type="submit" name="completeConsent" value="Complete consent flow" /></div>
                <h2>Return with error</h2>
                <div><select name="error">
                    <option value="invalid_request">invalid_request</option>
                    <option value="unauthorized_client">unauthorized_client</option>
                    <option value="access_denied">access_denied</option>
                    <option value="unsupported_response_type">unsupported_response_type</option>
                    <option value="invalid_scope">invalid_scope</option>
                    <option value="server_error">server_error</option>
                    <option value="temporarily_unavailable">temporarily_unavailable</option>
                </select></div>
                <div><input type="text" name="error_description" value="" /></div>
                <div><input type="submit" name="returnError" value="Return with error" /></div>
                </form>
                </html>
            `)

        })

        app.post('/authorize/consent-flow/:consentId', urlencoded({extended:true}), async (req, res) => {

            const Simulated = req.header("x-simulate") && true

            let consentManager = container.resolve(ConsentManager);
            let consent = await consentManager.GetById(parseInt(req.params.consentId))
            if (typeof consent =='undefined') return res.status(404).send();

            if (req.body.returnError) {
                return SendOAuthError(Simulated,res,consent.redirect_uri,req.body.state,req.body.error,req.body.error_description)
            } else {
                let redirect_uri = await container.resolve(GrantConsentMiddleware).GrantConsent({
                    user_id: req.body.userId,
                    request_id: consent.id,
                    scopes: JSON.parse(req.body.scopes)
                })
                if (Simulated) {
                    return res.json(redirect_uri)
                } else {
                    return res.header('x-redirect-alt-location',redirect_uri).redirect(redirect_uri)    
                }
            }


        })

        app.get('/mock.register.config', async (req,res) => {
            let config = await this.config()

            let brandName = process.env.TEST_DH_BRAND_NAME || "Test Data Holder 1"

            const getLogoUri = (text:string) => {
                let abbr = text.substr(0,3).toUpperCase();
    
                let hue = (_.reduce(_.map(brandName,c=>c.charCodeAt(0)),(sum,n)=>sum + n));
                if (typeof hue != 'number') throw 'I can hardly believe this'
                hue = Math.floor(hue * 360* 360 * 0.128376128763123) % 360
    
                const HSLToHex = (h:number,s:number,l:number) => {
                    s /= 100;
                    l /= 100;
                  
                    let c = (1 - Math.abs(2 * l - 1)) * s,
                        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
                        m = l - c/2,
                        r = 0,
                        g = 0,
                        b = 0;
                  
                    if (0 <= h && h < 60) {
                      r = c; g = x; b = 0;
                    } else if (60 <= h && h < 120) {
                      r = x; g = c; b = 0;
                    } else if (120 <= h && h < 180) {
                      r = 0; g = c; b = x;
                    } else if (180 <= h && h < 240) {
                      r = 0; g = x; b = c;
                    } else if (240 <= h && h < 300) {
                      r = x; g = 0; b = c;
                    } else if (300 <= h && h < 360) {
                      r = c; g = 0; b = x;
                    }
                    // Having obtained RGB, convert channels to hex
                    let rs = Math.round((r + m) * 255).toString(16);
                    let gs = Math.round((g + m) * 255).toString(16);
                    let bs = Math.round((b + m) * 255).toString(16);
                  
                    // Prepend 0s, if necessary
                    if (rs.length == 1)
                      rs = "0" + rs;
                    if (gs.length == 1)
                      gs = "0" + gs;
                    if (bs.length == 1)
                      bs = "0" + bs;
                  
                    return "#" + rs + gs + bs;
                }
    
                let colorHex = HSLToHex(hue,80,20);
    
                let svg = `<svg version="1.1"
                baseProfile="full"
                width="200" height="200"
                xmlns="http://www.w3.org/2000/svg">
             <circle cx="100" cy="100" r="80" fill="${colorHex}" />
             <text x="100" y="125" font-size="60" font-family="sans-serif" text-anchor="middle" fill="white">${abbr}</text></svg>`;
    
                let svgBase64 = Buffer.from(svg,'utf8').toString('base64');
    
                let uri = `data:image/svg+xml;base64,${svgBase64}`;
                return uri;
            }
    

            return res.json(    {
                "brandName": brandName,
                "industry": "BANKING",
                "logoUri": getLogoUri(brandName),
                "legalEntity": {
                    "legalEntityId": "legal-entity-id1",
                    "legalEntityName": "string",
                    "registrationNumber": "string",
                    "registrationDate": "2019-10-24",
                    "registeredCountry": "string",
                    "abn": "string",
                    "acn": "string",
                    "arbn": "string",
                    "industryCode": "string",
                    "organisationType": "SOLE_TRADER"
                },
                "status": "ACTIVE",
                "endpointDetail": {
                    "version": "string",
                    "publicBaseUri": config.FrontEndUrl,
                    "resourceBaseUri": config.FrontEndMtlsUrl, // secure
                    "infosecBaseUri": config.FrontEndUrl,
                    "extensionBaseUri": "string",
                    "websiteUri": "string"
                },
                "authDetails": [
                    {
                        "registerUType": "SIGNED-JWT",
                        "jwksEndpoint": urljoin(config.FrontEndUrl,"jwks")
                    }
                ],
                "lastUpdated": "2019-10-24T03:51:44Z"
            })
        })


        return app;

    }
}


export { DhServer }