import { Dictionary } from "../../../../Common/Server/Types";
import _ from "lodash";
import express from "express";
import { NextFunction } from "connect";
import { getType } from "mime";

import {check, validationResult, query, ValidationChain, body, matchedData} from 'express-validator'
import { TokenIssuer } from "../Helpers/TokenIssuer";
import { JWK, JWS } from "jose";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { ConsentManager } from "../../Entities/Consent";
import { urlencoded } from "body-parser";
import { EcosystemMetadata } from "../Helpers/EcosystemMetadata";
import urljoin from "url-join"
import { DhServerConfig } from "../Config";
import { SendOAuthError } from "../Helpers/OAuthFlowError";
import { GetStagedRequestById } from "./PushedAuthorizationRequest";

function Authorize(params: Dictionary<string>) {
    // pluck

    // Requirements not directly related to this endpoint
    // shall support [MTLS] as a holder of key mechanism;


    // constrained by FAPI:
    // 5.2.2 shall return ID Token as a detached signature to the authorization response;
    // shall include state hash, s_hash, in the ID Token to protect the state value if the client supplied a value for state. s_hash may be omitted from the ID Token returned from the Token Endpoint when s_hash is present in the ID Token returned from the Authorization Endpoint;
    // shall support signed ID Tokens;
    // shall require the request object to contain an exp claim; and
    // shall authenticate the confidential client at the token endpoint using private_key_jwt 
    // shall require a key of size 2048 bits or larger if RSA algorithms are used for the client authentication;
    // shall require the redirect_uri parameter in the authorization request;shall require redirect URIs to be pre-registered; shall require the value of redirect_uri to exactly match one of the pre-registered redirect URIs;
    // shall return token responses that conform to section 4.1.4 of [RFC6749];
    // shall return the list of granted scopes with the issued access token;

    // Only a response_type (see section 3 of [OIDC]) of code id_token SHALL be allowed.
    // The request_uri parameter SHALL NOT be supported. (and request must be used for signing purposes)

    // shall provide opaque non-guessable access tokens with a minimum of 128 bits of entropy where the probability of an attacker guessing the generated token is less than or equal to 2^(-160) as per [RFC6749] section 10.10;
    // shall return an invalid_client error as defined in 5.2 of [RFC6749] when mis-matched client identifiers were provided through the client authentication methods that permits sending the client identifier in more than one way;
    // shall require redirect URIs to use the https scheme; 


    // see https://tools.ietf.org/html/rfc6749#section-4.1.1

    /**
         GET /authorize?
        response_type=code%20id_token
        &client_id=s6BhdRkqt3
        &redirect_uri=https%3A%2F%2Fclient.example.org%2Fcb
        &scope=openid%20profile%20email
        &nonce=n-0S6_WzA2Mj
        &state=af0ifjsldkj HTTP/1.1
        */

    // GET can be used.

    // 3.1.2.2.  Authentication Request Validation
    // The Authorization Server MUST validate the request received as follows:

    // The Authorization Server MUST validate all the OAuth 2.0 parameters according to the OAuth 2.0 specification.
    // Verify that a scope parameter is present and contains the openid scope value. (If no openid scope value is present, the request may still be a valid OAuth 2.0 request, but is not an OpenID Connect request.)
    // The Authorization Server MUST verify that all the REQUIRED parameters are present and their usage conforms to this specification.
    // If the sub (subject) Claim is requested with a specific value for the ID Token, the Authorization Server MUST only send a positive response if the End-User identified by that sub value has an active session with the Authorization Server or has been Authenticated as a result of the request. The Authorization Server MUST NOT reply with an ID Token or Access Token for a different user, even if they have an active session with the Authorization Server. Such a request can be made either using an id_token_hint parameter or by requesting a specific Claim Value as described in Section 5.5.1, if the claims parameter is supported by the implementation.
    // As specified in OAuth 2.0 [RFC6749], Authorization Servers SHOULD ignore unrecognized request parameters.

    // If the Authorization Server encounters any error, it MUST return an error response, per Section 3.1.2.6.
}

@injectable()
class AuthorizeMiddleware {
    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentManager,
        @inject("EcosystemMetadata") private ecosystemMetadata:EcosystemMetadata,
        @inject("DhServerConfig") private config:() => Promise<DhServerConfig>,
    ){}

    handler = (options:{isPost: boolean}) => {    
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            next();
        }

        let AuthCodeTokenResponder = async (req:express.Request,res:express.Response,next: NextFunction) => {

            let m:{
                client_id: string,
                scope: string,
                redirect_uri: string,
                state: string,
                nonce: string,
                request?:string,
                request_uri?:string
            } = <any>matchedData(req);

            let sharingDuration = 0
            let existingArrangementId: string | undefined = undefined;

            const Simulated = req.header("x-simulate") && true

            try {
                let signingKeys = await (await this.ecosystemMetadata.getDataRecipient(m.client_id)).getJwks();

                let signed:any;
                
                if (typeof m.request == "string") {
                    signed = <any>JWS.verify(m.request,signingKeys);
                } else if (typeof m.request_uri == "string") {
                    signed = GetStagedRequestById(m.request_uri)
                } else {
                    throw "no valid request or request_uri supplied"
                }

                if (typeof signed != 'object') throw 'Signed is not an object';

                // TODO validate that the auth_token parameters match the request parameters
                // TODO validate the redirect_uri

                if (signed.claims && signed.claims.sharing_duration) {
                    if (typeof signed.claims.sharing_duration !== 'number') throw 'sharing_duration is not a number'
                    sharingDuration = signed.claims.sharing_duration;
                    // TODO limit sharingDuration to one year in seconds
                    // TODO return appropriate status code (not 500)
                }

                if (signed.claims && signed.claims.cdr_arrangement_id) {
                    if (typeof signed.claims.cdr_arrangement_id !== 'string') throw 'sharing_duration is not a string'
                    existingArrangementId = signed.claims.cdr_arrangement_id;
                    // TODO limit sharingDuration to one year in seconds
                    // TODO return appropriate status code (not 500)
                }


            } catch (err) {
                this.logger.warn("Authorize request not valid. ",err);
                if (Simulated) {
                    return res.json({unredirectable:true}) // Do not redirect in this case
                } else {
                    return res.json("request signature could not be validated") // Do not redirect in this case
                }
            }

            if (sharingDuration < 0) {
                return SendOAuthError(Simulated,res,m.redirect_uri,m.state,"invalid_request","sharing_duration must be at least 0")
            }

            try {
                let requestedConsent = await this.consentManager.requestConsent({
                    drAppClientId: <string>m.client_id,
                    scopes: m.scope.split(" "),
                    state:m.state,
                    nonce: m.nonce,
                    sharingDurationSeconds: sharingDuration,
                    existingArrangementId,
                    redirect_uri:<string>m.redirect_uri
                })
    
                if (Simulated) {
                    return res.json({dhConsentId:requestedConsent.id})
                } else {
                    let newUrl = urljoin((await this.config()).AuthorizeUrl,"consent-flow",requestedConsent.id.toString());
                    return res.header('x-redirect-alt-location',newUrl).redirect(newUrl)    
                }
            } catch (e) {
                return SendOAuthError(Simulated,res,m.redirect_uri,m.state,"server_error")
            }
        
        };

        // decide whether to validate based on body or query parameters
        let par;
        if (options.isPost) {
            par = body
        } else {
            par = query
        }

        return [
            urlencoded({extended:true}),
            par('scope',"scope must be provided").isString().not().isEmpty(),
            par('response_type').equals('code id_token').withMessage("response_type must be code id_token"),
            par('client_id').isString(),
            par('redirect_uri').isURL({require_protocol: true, require_valid_protocol: true, require_tld: false, protocols: ["https"]}).withMessage("must be an https URL"),
            par('state').isString().isLength({min: 5}),
            par('nonce').isString().isLength({min: 5}),
            par('display').isString().optional(),
            par('prompt').isString().optional(),
            par('max_age').isInt().optional().toInt(),
            par(['ui_locales','id_token_hint','login_hint','acr_values']).optional(),
            par('request').isString().optional(), // contains the signed authorization request
            par('request_uri').isString().optional(),

            // TODO Implememen the full suite of validation (i.e. to validate the JWT signature)

            validationErrorMiddleware,
            AuthCodeTokenResponder
        ];
    } 
}


export {Authorize, AuthorizeMiddleware}