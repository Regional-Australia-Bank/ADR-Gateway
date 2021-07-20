import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";


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
import { OIDCConfiguration, DhServerConfig } from "../Config";
import { StandardSerializeDrRegistration, RegistrationRequestParts } from "./ClientRegistration";

// TODO, probably a lot of other things to check here


@injectable()
class UpdateClientRegistrationMiddleware {
    OAuthScope: (realm: string, scope: string, aud?: string | (() => string | Promise<string>) | undefined) => (req: import("http").IncomingMessage, res: express.Response, next: any) => Promise<express.Response | undefined>;
    
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("PrivateKeystore") private ownKeystore:() => Promise<JWKS.KeyStore>,
        @inject("OIDCConfigurationPromiseFn") private oidcConfig: () => Promise<OIDCConfiguration>,
        @inject("CdrRegisterKeystoreProvider") private getRegisterKeystore: () => Promise<JSONWebKeySet>
    ){
        this.OAuthScope = ScopeMiddleware(ownKeystore,oidcConfig); // TODO should also check aud value
    }

    private clientRegistrationSchema:Schema = {
        "software_statement.original": {
            isJWT:true,
            custom:{
                options:async(jwt:string) => {
                    JWT.verify(jwt,JWKS.asKeyStore(await this.getRegisterKeystore()))
                }
            },
        },
        "software_statement.verified.payload.jwks_uri": {
            isURL: {
                options: {
                    require_tld: false
                }
            }
        },
        "software_statement.verified.payload.software_id": {
            isString: true
        },
        "registrationRequest.original": {
            isJWT:true,
        },
    };

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            if (req.headers['content-type'] != 'application/jwt') return res.status(400).json({ error: "content-type must be application/jwt"});

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response,next: NextFunction) => {
            const dr_client_id = (<any>req).token_subject;

            let params = <any>matchedData(req)[""];

            let validatedRequestParts:RegistrationRequestParts = _.merge(
                _.pick(params.registrationRequest.decoded.payload,
                    'redirect_uris',
                    'token_endpoint_auth_signing_alg',
                    'token_endpoint_auth_method',
                    'grant_types',
                    'response_types',
                    'application_type',
                    'id_token_signed_response_alg',
                    'id_token_encrypted_response_alg',
                    'id_token_encrypted_response_enc',
                    'request_object_signing_alg',
                ),{
                    ssa: _.pick(params.software_statement.verified.payload,
                        'org_id',
                        'org_name',
                        'client_name',
                        'client_description',
                        'client_uri',
                        'redirect_uris',
                        'recipient_base_uri',
                        'logo_uri',
                        'tos_uri',
                        'policy_uri',
                        'jwks_uri',
                        'revocation_uri',
                        'software_id',
                        'software_roles',
                        'scope',
                    )
    
                }
            )

            if (validatedRequestParts.id_token_signed_response_alg == "RS256") {
                return res.status(400).json("I don't like RS256")
            }

            let updatedRegistration = await this.clientRegistrationManager.UpdateRegistration(
                dr_client_id,
                params.software_statement.verified.payload.software_id,
                params.registrationRequest.decoded.payload.redirect_uris,
                params.software_statement.verified.payload.scope,
                params.software_statement.verified.payload.jwks_uri,
                validatedRequestParts,
                params.software_statement.original
                );

            let response = StandardSerializeDrRegistration(updatedRegistration);

            res.status(200).json(response);

        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
            this.OAuthScope("dh-realm","cdr:registration",async () => await (await this.oidcConfig()).token_endpoint),
        ],[
            bodyParser.text({type:'application/jwt'}),
            <any>body().customSanitizer(jwt => ({
                registrationRequest: {
                    original: jwt,
                    decoded: TryOrUndefined(() => JWT.decode(jwt,{complete: true}))
                }
            })).customSanitizer(requestPackage => _.assign(requestPackage,TryOrUndefined(() => ({
                software_statement: {
                    original: requestPackage.registrationRequest.decoded.payload.software_statement,
                    verified: JWT.decode(requestPackage.registrationRequest.decoded.payload.software_statement,{complete: true})
                }
            })))),
            checkSchema(this.clientRegistrationSchema),
            // TODO turn on above checkSchema
            
        ],[
            validationErrorMiddleware,
            Responder
        ])
    }

}

export {UpdateClientRegistrationMiddleware}