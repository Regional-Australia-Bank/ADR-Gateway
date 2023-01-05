import "reflect-metadata";

import express from "express";
import { JWKS } from "jose";
import { injectable, inject, registry } from "tsyringe";
import winston from "winston";
import { DataHolderMetadataProvider, DataholderMetadata } from "../../Common/Services/DataholderMetadata";
import bodyParser from "body-parser";
import { AdrGatewayConfig } from "../Config";
import { ConsentConfirmationMiddleware } from "./Middleware/ConsentConfirmation";
import _ from "lodash"
import { ConsentRequestMiddleware } from "./Middleware/ConsentRequest";
import { ConsumerDataAccessMiddleware } from "./Middleware/ConsumerDataAccess";
import { ConsentListingMiddleware } from "./Middleware/ConsentListing";
import { ConsentDeletionMiddleware } from "./Middleware/ConsentDeletion";
import { ActiveConsentsListMiddleware } from './Middleware/ActiveConsents';
import cors from "cors";
import { UserInfoProxyMiddleware } from "./Middleware/UserInfo";
import { ConsentDetailsMiddleware } from "./Middleware/ConsentDetails";
import URLParse from "url-parse";
import qs from "qs";
import { DefaultConnector } from "../../Common/Connectivity/Connector.generated";
import { EcosystemErrorFilter } from "./Helpers/EcosystemErrorFilter";
import { resolve } from "dns";
import { throws } from "assert";


@injectable()
class AdrGateway {
    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("EcosystemErrorFilter") private ecosystemErrorFilter: EcosystemErrorFilter,
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<DataholderMetadata>,
        @inject("AdrGatewayConfig") private config: (() => Promise<AdrGatewayConfig>),
        private consentConfirmationMiddleware: ConsentConfirmationMiddleware,
        private consentRequestMiddleware: ConsentRequestMiddleware,
        private consentListingMiddleware: ConsentListingMiddleware,
        private consentDetailsMiddleware: ConsentDetailsMiddleware,
        private consentDeletionMiddleware: ConsentDeletionMiddleware,
        private consumerDataAccess: ConsumerDataAccessMiddleware,
        private userInfo: UserInfoProxyMiddleware,
        private connector: DefaultConnector,
        private activeConsentsListMiddleware : ActiveConsentsListMiddleware
    ) { }

    init(): any {
        /**
         * API is defined here: https://app.swaggerhub.com/apis/Reg-Aust-Bank/DataRecipientMiddleware/1.0.0#/
         */
        const app = express();

        this.logger.info("Starting up adr gateway -----")

        

        app.get("/jwks", async (req, res) => {
            // output the public portion of the key

            res.setHeader("content-type", "application/json");
            let jwks = await this.connector.DataRecipientJwks().GetWithHealing();
            res.json(jwks.toJWKS());
            this.logger.info("Someone requested JWKS")

        });

        
        app.get("/cdr/data-holders", async (req, res) => {
            try {
                let dataholders = await this.dataHolderMetadataProvider.getDataHolders();
                res.json(_.map(dataholders, dh => _.pick(dh, 'dataHolderBrandId', 'brandName', 'logoUri', 'industry', 'legalEntityName', 'websiteUri', 'abn', 'acn', 'publicBaseUri')));
            } catch (err) {
                const formattedError = this.ecosystemErrorFilter.formatEcosystemError(err, "Error getting list of data holder brands from the register");
                if (formattedError) {
                    res.status(500).json(formattedError)
                } else {
                    res.status(500).json({ error: "ecosystem_outage" })
                }
            }

        });

        app.get("/cdr/data-holders/:dataholderbrandid", async (req, res) => {
            try {
                const dh = await this.dataHolderMetadataProvider.getDataHolder(req.params.dataholderbrandid);
                const oidc = await this.connector.DataHolderOidc(req.params.dataholderbrandid).GetWithHealing();

                res.json({
                    ..._.pick(dh, 'dataHolderBrandId', 'brandName', 'logoUri', 'industry', 'legalEntityName', 'websiteUri', 'abn', 'acn', 'publicBaseUri'),
                    scopes_supported: oidc.scopes_supported
                });
            } catch (err) {
                const formattedError = this.ecosystemErrorFilter.formatEcosystemError(err, "Error getting list of data holder details from the register");
                if (formattedError) {
                    res.status(500).json(formattedError)
                } else {
                    res.status(500).json({ error: "ecosystem_outage" })
                }
            }
        });

        app.get("/cdr/data-holders/:dataholderbrandid/status", async (req, res) => {
            try {
                
                const holderStatus = await this.connector.DataHolderStatus(req.params.dataholderbrandid).GetWithHealing();
                console.log(`CDR -- ${req.params.dataholderbrandid} --`,holderStatus)
                res.json({ status: holderStatus });
            } catch (err) {
                const formattedError = this.ecosystemErrorFilter.formatEcosystemError(err, "Error getting data holder status");
                if (formattedError) {
                    res.status(500).json(formattedError)
                } else {
                    res.status(500).json({ error: "ecosystem_outage" })
                }
            }
        });

        app.get("/cdr/consents",
            this.consentListingMiddleware.handler()
        );

        app.get('/cdr/consents/active', 
            this.activeConsentsListMiddleware.handler()
        );

        app.get("/cdr/products", async (req, res) => {
            try {
                return res.json(await this.connector.SoftwareProductConfigs().GetWithHealing())
            } catch (e) {
                return res.status(500).send();
            }
        });

        app.get("/config/products", async (req, res) => {
            try {
                let config = await this.connector.AdrConnectivityConfig().GetWithHealing();
                return res.json(config.SoftwareProductConfigUris)
            } catch (e) {
                return res.status(500).send();
            }
        });


        // TODO test and fix invalid data holder id returns 404 (currently returns 500)
        app.post("/cdr/consents",
            bodyParser.json(),
            this.consentRequestMiddleware.handler()
        );

        /**
         * Handles response from data holder, performing token checking and database update
         * This is the OAuth2 Authorization Redirection Endpoint https://tools.ietf.org/html/rfc6749#section-3.1.2
         * Validation defined here: https://openid.net/specs/openid-connect-core-1_0.html#HybridAuthResponse
         */
        app.get("/cdr/consents/:consentId",
            this.consentDetailsMiddleware.handler()
        );

        app.patch("/cdr/consents/:consentId",
            bodyParser.raw({ type: ['text/plain', 'application/json'] }),
            (req, res, next) => {
                try {
                    let body = Buffer.from(req.body).toString('utf-8');
                    if (typeof body === "string") {
                        try {
                            req.body = JSON.parse(body)
                        } catch {
                            let hash = URLParse(body).hash;
                            if (hash[0] === '#') {
                                req.body = qs.parse(hash.substring(1));
                            }
                        }
                    }

                } catch {
                    res.status(406).json({ "error": "Could not parse body. Must be a valid URL with a hash component or a JSON body of the hash components." })
                }
                next()
            },
            this.consentConfirmationMiddleware.handle
        );

        app.options("/cdr/consents/:consentId",
            cors({
                methods: ['GET', 'PATCH', 'POST']
            })
        );


        app.delete("/cdr/consents/:consentId",
            this.consentDeletionMiddleware.handler()
        );

        this.config().then(endPointConfig => {
            // TODO fix consumerDataAccess.handler routes - promise rejections to return 400 or something else, not hang forever
            app.get("/cdr/consents/:consentId/accounts",
                this.consumerDataAccess.handler('/cds-au/v1/banking/accounts', 'bank:accounts.basic:read', endPointConfig.DefaultAPIVersion.getAccounts)
            )
        
            app.get("/cdr/consents/:consentId/accounts/balances",
                this.consumerDataAccess.handler('/cds-au/v1/banking/accounts/balances', 'bank:accounts.basic:read', endPointConfig.DefaultAPIVersion.getBulkBalance)
            )
        
            app.post("/cdr/consents/:consentId/accounts/balances",
                bodyParser.json(),
                this.consumerDataAccess.handler('/cds-au/v1/banking/accounts/balances', 'bank:accounts.basic:read', endPointConfig.DefaultAPIVersion.getBalancesForSpecificAccount)
            )
        
            app.get("/cdr/consents/:consentId/accounts/direct-debits",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/direct-debits`, 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getBulkDirectDebits)
            )
        
            app.post("/cdr/consents/:consentId/accounts/direct-debits",
                bodyParser.json(),
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/direct-debits`, 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getDirectDebitsForSpecificAccounts)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId/direct-debits",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}/direct-debits`, 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getDirectDebitsForAccount)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId/balance",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}/balance`, 'bank:accounts.basic:read', endPointConfig.DefaultAPIVersion.getAccountBalance)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}`, 'bank:accounts.detail:read', endPointConfig.DefaultAPIVersion.getAccountDetail)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId/transactions",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}/transactions`, 'bank:transactions:read', endPointConfig.DefaultAPIVersion.getTransactionsForAccount)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId/transactions/:transactionId",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}/transactions/${p.transactionId}`, 'bank:transactions:read', endPointConfig.DefaultAPIVersion.getTransactionDetail)
            )
        
            app.get("/cdr/consents/:consentId/accounts/:accountId/payments/scheduled",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/accounts/${p.accountId}/payments/scheduled`, 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getScheduledPaymentsForAccount)
            )
        
            app.get("/cdr/consents/:consentId/payments/scheduled",
                this.consumerDataAccess.handler('/cds-au/v1/banking/payments/scheduled', 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getScheduledPaymentsBulk)
            )
        
            app.post("/cdr/consents/:consentId/payments/scheduled",
                bodyParser.json(),
                this.consumerDataAccess.handler('/cds-au/v1/banking/payments/scheduled', 'bank:regular_payments:read', endPointConfig.DefaultAPIVersion.getScheduledPaymentsForSpecificAccount)
            )
        
            app.get("/cdr/consents/:consentId/payees",
                this.consumerDataAccess.handler('/cds-au/v1/banking/payees', 'bank:payees:read', endPointConfig.DefaultAPIVersion.getPayees)
            )
        
            app.get("/cdr/consents/:consentId/payees/:payeeId",
                this.consumerDataAccess.handler(p => `/cds-au/v1/banking/payees/${p.payeeId}`, 'bank:payees:read', endPointConfig.DefaultAPIVersion.getPayeeDetail)
            )
        
            app.get("/cdr/consents/:consentId/consumerInfo",
                this.consumerDataAccess.handler('/cds-au/v1/common/customer', 'common:customer.basic:read', endPointConfig.DefaultAPIVersion.getCustomer)
            )
        
            app.get("/cdr/consents/:consentId/consumerInfo/detail",
                this.consumerDataAccess.handler('/cds-au/v1/common/customer/detail', 'common:customer.detail:read', endPointConfig.DefaultAPIVersion.getCustomerDetail)
            )
        
            app.get("/cdr/consents/:consentId/userInfo",
                this.userInfo.handler()
            );
        }).catch(err => {
            this.logger.error(" ------- IMPORTANT ---- Unable to start up endpoint with default configuration")
        })
        /** TODO
         * Endpoints yet to implement
         * * GET /discovery/outages
         * * GET /banking/products
         * * GET /banking/products/{productId}
         */

        ;(<any>app).connector = this.connector;

        return app;
    }
}

export {  AdrGateway  }