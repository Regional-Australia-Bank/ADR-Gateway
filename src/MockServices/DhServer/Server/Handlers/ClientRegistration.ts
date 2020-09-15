import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";

import { validationResult, matchedData, checkSchema, Schema, body} from 'express-validator'
import { inject, injectable } from "tsyringe";
import winston from "winston";
import { JWT, JWKS, JSONWebKeySet } from "jose";
import bodyParser from "body-parser";
import { TryOrUndefined } from "../../../../Common/ScriptUtil";
import { ClientRegistrationManager, ClientRegistration } from "../../Entities/ClientRegistration";
import moment from "moment";

export interface RegistrationRequestParts {
    'redirect_uris'?: string[],
    'token_endpoint_auth_signing_alg': string,
    'token_endpoint_auth_method': string,
    'grant_types': string[],
    'response_types': string[],
    'application_type'?:string,
    'id_token_signed_response_alg':string,
    'id_token_encrypted_response_alg':string,
    'id_token_encrypted_response_enc':string,
    'request_object_signing_alg'?:string,
    'ssa': {
        'org_id':string,
        'org_name':string,
        'client_name':string,
        'client_description':string,
        'client_uri':string,
        'redirect_uris':string[],
        'recipient_base_uri':string
        'logo_uri':string,
        'tos_uri'?:string,
        'policy_uri'?:string,
        'jwks_uri':string,
        'revocation_uri':string,
        'software_id':string,
        'software_roles':string,
        'scope':string,    
    }
}


// TODO, probably a lot of other things to check here

export const StandardSerializeDrRegistration = (reg: ClientRegistration) => {
    let regParts:RegistrationRequestParts|undefined = JSON.parse(reg.requestPartsJson||"null");

    if (!regParts) throw 'Necessary details for registration are unavailable'

    return {
        client_id: reg.clientId,
        client_id_issued_at: moment(reg.issuedAt).utc().unix(),
        client_name: regParts.ssa.client_name,
        client_description: regParts.ssa.client_description,
        client_uri: regParts.ssa.client_uri,
        application_type: regParts.application_type,
        org_id: regParts.ssa.org_id,
        org_name: regParts.ssa.org_name,
        redirect_uris: reg.redirectUris(),
        recipient_base_uri: regParts.ssa.recipient_base_uri,
        logo_uri: regParts.ssa.logo_uri,
        tos_uri: regParts.ssa.tos_uri,
        policy_uri: regParts.ssa.policy_uri,
        jwks_uri: regParts.ssa.jwks_uri,
        revocation_uri: regParts.ssa.revocation_uri,
        token_endpoint_auth_method: regParts.token_endpoint_auth_method,
        token_endpoint_auth_signing_alg: regParts.token_endpoint_auth_signing_alg,
        grant_types: regParts.grant_types,
        response_types: regParts.response_types,
        id_token_signed_response_alg: regParts.id_token_signed_response_alg,
        id_token_encrypted_response_alg: regParts.id_token_encrypted_response_alg,
        id_token_encrypted_response_enc: regParts.id_token_encrypted_response_enc,
        software_statement: reg.softwareStatement,
        software_id: regParts.ssa.software_id,
        scope: reg.scopeString()
    }
}

@injectable()
class ClientRegistrationMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("CdrRegisterKeystoreProvider") private getRegisterKeystore: () => Promise<JSONWebKeySet>
    ){}

    private clientRegistrationSchema:Schema = {
        "software_statement.original": {
            isJWT:true,
            custom:{
                options:async(jwt:string) => {
                    let jwks = await this.getRegisterKeystore();
                    JWT.verify(jwt,JWKS.asKeyStore(jwks))
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

            // TODO validate the SSA

            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response,next: NextFunction) => {
    
            let params = <any>matchedData(req)[""];

            for (let redirect_uri of params.registrationRequest.decoded.payload.redirect_uris) {
                if (!_.find(params.software_statement.verified.payload.redirect_uris,r=>r===redirect_uri)) {
                    return res.status(400).json({ error: `Software statement assertion does not list ${redirect_uri} as a permissible redirect_uri` });
                }
            }

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
            let newRegistration = await this.clientRegistrationManager.NewRegistration(
                params.software_statement.verified.payload.software_id,
                params.registrationRequest.decoded.payload.redirect_uris,
                params.software_statement.verified.payload.scope,
                params.software_statement.verified.payload.jwks_uri,
                validatedRequestParts,
                params.software_statement.original
                );

            let response = StandardSerializeDrRegistration(newRegistration);

            res.status(201).json(response);

            // JWT.decode(jwt,{})
  
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat([
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

export {ClientRegistrationMiddleware}