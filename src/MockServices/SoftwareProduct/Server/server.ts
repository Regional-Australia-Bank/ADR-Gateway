import "reflect-metadata";
import express from "express";
import _ from "lodash"
import { MockSoftwareProductConfig } from "./Config";

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