import express from "express";
import winston from "winston";
import { IncomingMessage } from "http";
import * as _ from "lodash";
import { inject, injectable } from "tsyringe";
import { isHttpCodeError, formatErrorPayload, HttpCodeError} from "../../../Common/Server/ErrorHandling";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog";
import { JWKS } from "jose";
import { AdrGatewayConfig } from "../../Config";
import { oidc_fapi_hash } from "../../../Common/SecurityProfile/Util";
import { DataHolderMetadataProvider, Dataholder } from "../../Services/DataholderMetadata";
import { Dictionary } from "../../../Common/Server/Types";
import { DefaultPathways } from "../Connectivity/Pathways";
import { IdTokenValidationParts } from "../Connectivity/Neurons/IdTokenCodeValidation";


// class ConsumerUnauthorisedError extends HttpCodeError{
//     constructor(logmessage:string) {
//         super(logmessage,401)
//     }
// }

@injectable()
class ConsentConfirmationMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<Dataholder>,
        private consentManager:ConsentRequestLogManager,
        private pw:DefaultPathways
    ) { }

    handle = async (req:IncomingMessage & {body:any, params:Dictionary<string>},res:express.Response) => {

        try {
            const getBodyString = (key: string) => {
                let v = req.body[key];
                if (typeof v != 'string') {
                    throw `Expected ${key} body string param`;
                }
                return v;
            };

            const getOptionalBodyString = (key: string) => {
                let v = req.body[key];
                if (typeof v != 'string' && typeof v != 'undefined') {
                    throw `Expected body param ${key} to be string or not present`;
                }
                return v;
            };

            let consentId = parseInt(req.params['consentId']);
            this.logger.info(`Request to finalise consent at data holder: ${consentId}`);

            // expected query string parameters:

            // code
            // id_token (signed and then encrypted)
            const getNominalParams = () => {
                return {
                    authCode: getBodyString('code'),
                    idToken: getBodyString('id_token'),
                    state: getBodyString('state')
                }  
            }

            const getErrorParams = () => {
                return {
                    error: getBodyString('error'),
                    error_description: getOptionalBodyString('error_description'),
                    error_uri: getOptionalBodyString('error_uri'),
                    state: getBodyString('state')
                }  
            }

            let params:ReturnType<typeof getNominalParams>|undefined = undefined;
            let errorParams:ReturnType<typeof getErrorParams>|undefined = undefined;
            try {
                params = getNominalParams()
            } catch {
                errorParams = getErrorParams()
            }

            if (typeof errorParams != 'undefined') {
                this.logger.warn(errorParams);
                res.sendStatus(499);
                return;
            }

            if (typeof params == 'undefined') {
                res.sendStatus(400);
                return;
            }

            // state
            // nonce

            // will see if we can find an auth request in the DB with matching state,nonce,dataHolderBrandId. Will also return a system and userId
            
            let consentRequest: ConsentRequestLog;
            try {
                consentRequest = await this.consentManager.FindAuthRequest({
                    id: consentId,
                    // state: params.state,
                    // nonce: params.nonce - will instead check later. State and nonce are not needed to identify a request, only to validate it
                })    
            } catch {
                res.sendStatus(404);
                return;
            }

            // // res.sendStatus(200).send("My job to do some validation of the stuff now.")
            // // return;

            // Do validation checks from here: https://openid.net/specs/openid-connect-core-1_0.html#HybridAuthResponse

            // 1. Verify that the response conforms to Section 5 of [OAuth.Responses].
            // 1.1. has code and id_token (already checked)
            // 1.2. is fragment encoded (already assumed)

            // 2.1 Follow validation rules RFC6749 4.1.2 - code and state are required, or error and optionally error_description and error_uri

            // 2.2 Follow validation rules RFC6749 10.12 - to be implemented at redirection URI endpoint.

            // X.1: We have to decrypt the token and do a basic signature verification before further verifications

            // TODO check that this self heals in the case when an expired Dataholder JWKS is cached. Very low priority.
            let verifiedIdToken: IdTokenValidationParts
            try {
                verifiedIdToken = await this.pw.ValidIdTokenCode(consentRequest.dataHolderId,params.idToken).GetWithHealing()                
            } catch (e) {
                throw new HttpCodeError("Could not verify id token",400,{
                    code: "invalid_id_token",
                    detail: e
                })
            }

            // 3. Follow the ID Token validation rules in Section 3.3.2.12 when the response_type value used is code id_token or code id_token token.
            // 3.2.2.11 The value of the nonce Claim MUST be checked to verify that it is the same value as the one that was sent in the Authentication Request. The Client SHOULD check the nonce value for replay attacks. The precise method for detecting replay attacks is Client specific.

            if (!consentRequest.nonce) {
                // If we did not supply a nonce, take the nonce value from the data holder
                consentRequest.nonce = verifiedIdToken.nonce
                consentRequest = await consentRequest.save()
            } else {
                if (verifiedIdToken.nonce != consentRequest.nonce) throw 'Nonces do not match';
            }
            
            //  The Client SHOULD check the nonce value for replay attacks
            if (typeof consentRequest.idTokenJson == 'string') throw 'Potential replay attack. Nonce has already been used to activate this token.'
            
            
            // 3.2.1 https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
            // TODO check acr and auth_time claims if they exist

            // 4. Access Token validation N/A

            // 5. Follow the Authorization Code validation rules in Section 3.3.2.10 when the response_type value used is code id_token or code id_token token.
            // 5.1 c_hash validation
            let acHashValid:boolean = verifiedIdToken.c_hash == oidc_fapi_hash(params.authCode)
            if (!acHashValid) throw 'Hash of auth_code is not valid';
            
            // TODO Must/should also log the response

            // Fetch an initial token and output to check scopes

            let updatedConsent = await this.pw.FinaliseConsent(consentRequest,params.authCode).GetWithHealing();
            let missingScopes = updatedConsent.MissingScopes();
            let scopesFulfilled = (missingScopes.length == 0)

            return res.json({
                scopesFulfilled: scopesFulfilled,
                requestedScopes: JSON.parse(updatedConsent.requestedScopesJson),
                missingScopes: missingScopes
            })
            
        } catch (err) {
            if (isHttpCodeError(err)) {
                this.logger.warn(err.message,err);
                res.status(err.httpCode)
                let payload = err.payload;
                if (payload) {res.json(formatErrorPayload(payload))};
                res.send();
                return;    
            } else {
                this.logger.error(err);
                res.status(500).send();
                return;
            }
        }
    };   

}

export {ConsentConfirmationMiddleware}