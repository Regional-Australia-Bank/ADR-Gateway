import "reflect-metadata";

import express from "express";
import { AdrJwksConfig } from "./Config";

export class AdrJwks {
    constructor(private config:AdrJwksConfig) {}

    init(): ReturnType<typeof express> {
        const app = express();       
       

        app.get( "/private.jwks", async ( req, res ) => {         
            res.json(this.config.Jwks);
        } );
                    
        return app;
       
    }
}
