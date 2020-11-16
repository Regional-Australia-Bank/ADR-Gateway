import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";
import { getType } from "mime";

import { validationResult, matchedData, checkSchema, Schema, body} from 'express-validator'
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { ConsentManager } from "../../Entities/Consent";
import uuid from "uuid";
import { readFileSync } from "fs";
import { JWT, JWS, JWKS, JSONWebKeySet } from "jose";
import bodyParser from "body-parser";
import { TryOrUndefined } from "../../../../Common/ScriptUtil";
import { IsJWT } from "class-validator";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import moment from "moment";
import { ScopeMiddleware } from "../../../../Common/Server/Middleware/TokenVerification";
import { OIDCConfiguration, DhServerConfig, testIssuer } from "../Config";
import { StandardSerializeDrRegistration } from "./ClientRegistration";

// TODO, probably a lot of other things to check here


@injectable()
class GetClientRegistrationMiddleware {
    OAuthScope: (realm: string, scope: string, aud?: string | (() => Promise<string> | string) | undefined) => (req: import("http").IncomingMessage, res: express.Response, next: any) => Promise<express.Response | undefined>;
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("PrivateKeystore") private ownKeystore:() => Promise<JWKS.KeyStore>,
        @inject("OIDCConfigurationPromiseFn") private oidcConfig: () => Promise<OIDCConfiguration>,
        @inject("DhServerConfig") private config:() => Promise<DhServerConfig>,
        @inject("CdrRegisterKeystoreProvider") private getRegisterKeystore: () => Promise<JSONWebKeySet>
    ){
        this.OAuthScope = ScopeMiddleware(ownKeystore,oidcConfig); // TODO should also check aud value
    }

    handler = () => {
    
        let Responder = async (req:express.Request,res:express.Response,next: NextFunction) => {
            const dr_client_id = (<any>req).token_subject; // the client_id from the auth token
            if (dr_client_id != req.params.clientId) { // compare to the client_id URL param
                return res.status(403).send();
            }
            let reg = await this.clientRegistrationManager.GetRegistration(dr_client_id);
            if (typeof reg == 'undefined') {
                return res.status(401).send();
            }
            res.status(200).json(StandardSerializeDrRegistration(reg));
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization

        return _.concat([
            this.OAuthScope("dh-realm","cdr:registration",async() => (await this.oidcConfig()).token_endpoint),
            Responder
        ])
    }

}

export {GetClientRegistrationMiddleware}