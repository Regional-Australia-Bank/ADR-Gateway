import "reflect-metadata";
import * as fs from "fs"
import express from "express";
import { GenerateOidcSpec } from "./OidcSpec";
import { MockDataArray, PaginationMiddleware } from "../../../Common/Server/Middleware/Pagination";
import _ from "lodash"
import { RemoveSsaParticulars, DataRecipientStatuses, DataRecipientProductStatuses } from "../Helpers/DataTransform";
import { matchedData, param } from "express-validator";
import { ValidationErrorMiddleware } from "../Helpers/Validation";
import { GetSSA } from "../Helpers/GetSSA";
import { JWKS, JWT, JSONWebKeySet } from "jose";
import { ScopeMiddleware } from "../../../Common/Server/Middleware/TokenVerification";
import { DataHolders } from "../MockData/DataHolders";
import { DataRecipients } from "../MockData/DataRecipients";
import { GetJwks } from "../../../Common/Init/Jwks";
import { DefaultPathways } from "../../../AdrGateway/Server/Connectivity/Pathways";
import { MockRegisterConfig } from "./Config";
import { axios } from "../../../Common/Axios/axios";
import moment from "moment";

export interface Client {
    clientId: string
    jwksUri: string;
}

export class MockRegister {
    constructor(
        private configFn:() => Promise<MockRegisterConfig>,
        private clientProvider:(clientId:string) => Promise<Client>,
        private pw:DefaultPathways
    ) {}

    private paginationMiddleware:PaginationMiddleware = new PaginationMiddleware(this.configFn)
    
    async init(): Promise<any> {
        const app = express();
        const issuerUrl = 'https://cdr-register.mocking';

        const { Provider } = require('oidc-provider');
        
        let jwks = GetJwks((await this.configFn()))
        const JWKSet = jwks.toJWKS(true)
        const oidcSpec = GenerateOidcSpec(<any>JWKSet);
        const oidc = new Provider(issuerUrl, oidcSpec);
        const originalFind:((client:string) => Promise<Client>) = oidc.Client.find;

        // replace the placeholder client with that given by the provider
        oidc.Client.find = async (id:string):Promise<Client|undefined> => {
            let client = await originalFind('client-id-placeholder')
            let presentedClient = await this.clientProvider(id)
            if (typeof client === 'undefined') return undefined;
            client.clientId = presentedClient.clientId
            client.jwksUri = presentedClient.jwksUri
            return client;
        }

        oidc.proxy = true;
        const OAuthScope = ScopeMiddleware(() => Promise.resolve(jwks),() => Promise.resolve({issuer:issuerUrl}));

        const dataRecipients = DataRecipients
              
        function handleClientAuthErrors(err:any, meta:any) {
        //   if (err.statusCode === 401 && err.message === 'invalid_client') {
             console.log(err);
             console.log(meta);
        //     // save error details out-of-bands for the client developers, `authorization`, `body`, `client`
        //     // are just some details available, you can dig in ctx object for more.
        //   }
        }

        // override oidc-provider jwks
        app.get('/oidc/jwks',async (req,res) => {
            let publicRegisterJwks:JSONWebKeySet
            try {
                publicRegisterJwks = await (await axios.get("https://api.int.cdr.gov.au/cdr-register/v1/jwks",{responseType:"json"})).data;
            } catch {
                publicRegisterJwks = {keys:[]}
            }
            let mockRegisterJwks = jwks.toJWKS();

            return res.status(200).json({keys:_.concat(mockRegisterJwks.keys,publicRegisterJwks.keys)})
        })

        oidc.on('grant.error', handleClientAuthErrors);
        oidc.on('introspection.error', handleClientAuthErrors);
        oidc.on('revocation.error', handleClientAuthErrors);
        
        app.get('/v1/banking/data-holders/brands',
            OAuthScope("cdr:register:realm","cdr-register:bank:read"),
            // MockDataArray(async () => DataHolders((await this.configFn()).MockDhBaseUri)),
            MockDataArray(async (req:express.Request) => _.filter(await DataHolders((await this.configFn()).MockDhBaseUri,(await this.configFn()).MockDhBaseMtlsUri), (t:any) => {
                if (req.query["updated-since"]) {
                    if (!t.lastUpdated) return true;
                    if (moment(t.lastUpdated).isSameOrAfter(moment(<any>req.query["updated-since"]))) return true;
                    return false;
                }
                return true;
            })),
            this.paginationMiddleware.Paginate({baseUrl: '/v1/banking/data-holders/brands'})
        ) // paginated
        
        app.get('/v1/banking/data-recipients', (req, res) => {
            return res.json({data:RemoveSsaParticulars(dataRecipients)}) // not paginated
        })
        app.get('/v1/banking/data-recipients/status', (req, res) => {
            return res.json({dataRecipients:DataRecipientStatuses(dataRecipients)})
        }) // not paginated
        app.get('/v1/banking/data-recipients/brands/software-products/status', (req, res) => {
            return res.json({softwareProducts:DataRecipientProductStatuses(dataRecipients)})
        }) // not paginated

        app.get('/v1/banking/data-recipients/brands/:dataRecipientBrandId/software-products/:softwareProductId/ssa',
            param('dataRecipientBrandId').isString().isLength({min:5}),
            param('softwareProductId').isString().isLength({min:5}),
            // middleware to identify data recipient... needed? Nah.
            ValidationErrorMiddleware,
            async (req, res) => {
                // TODO remove

                if (typeof req.headers.authorization !== 'string') return res.status(401).send();

                let ah = /^bearer (.*)$/i.exec(req.headers.authorization);
                if (!ah) return res.status(401).send();
                let bearer = ah[1];
                try {
                    JWT.verify(bearer,jwks);
                } catch (e) {
                    console.error(e)
                    return res.status(401).send();
                }

                const m:{
                    dataRecipientBrandId: string,
                    softwareProductId: string
                } = <any>matchedData(req);

                try {
                    const ssa = await GetSSA(m.dataRecipientBrandId,m.softwareProductId,dataRecipients,jwks.get({use:'sig',alg:'PS256'}),this.pw,this.clientProvider);
                    res.status(200).contentType('application/jwt').send(ssa);
                } catch (err) { 
                    if (typeof err.statusCode == 'number') {
                        res.status(err.statusCode).json(err.errorMessage);
                    } else {
                        console.log(err);
                        res.status(500).json("Internal Server Error");
                    }
                    
                }
                
            })

        app.use('/oidc', oidc.callback);
        
        
        return app;
        
    }
}