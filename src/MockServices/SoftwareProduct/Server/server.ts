import "reflect-metadata";
import * as fs from "fs"
import express from "express";
import { MockDataArray, PaginationMiddleware } from "../../../Common/Server/Middleware/Pagination";
import _ from "lodash"
import { matchedData, param } from "express-validator";
import { JWKS, JWT, JSONWebKeySet } from "jose";
import { ScopeMiddleware } from "../../../Common/Server/Middleware/TokenVerification";
import { GetJwks } from "../../../Common/Init/Jwks";
import { DefaultPathways } from "../../../AdrGateway/Server/Connectivity/Pathways";
import { MockSoftwareProductConfig } from "./Config";
import { axios } from "../../../Common/Axios/axios";
import moment from "moment";

export interface Client {
    clientId: string
    jwksUri: string;
}

export class MockSoftwareProduct {
    constructor(
        private configFn:() => Promise<MockSoftwareProductConfig>,
    ) {}

    async init(): Promise<any> {
        const app = express();


        app.get('/software.product.config',async (req,res) => {
            let config = (await this.configFn())

            return res.status(200).json(_.omit(config,'Port'))
        })

        
        
        return app;
        
    }
}