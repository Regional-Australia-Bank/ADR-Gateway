import express from "express";
import winston from "winston";
import { IncomingMessage } from "http";
import _ from "lodash";
import { inject, injectable } from "tsyringe";
import { isHttpCodeError, formatErrorPayload } from "../../../Common/Server/ErrorHandling";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../../Common/Entities/ConsentRequestLog";
import { Dictionary } from "../../../Common/Server/Types";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { EcosystemErrorFilter } from "../Helpers/EcosystemErrorFilter";

@injectable()
class ConsentConfirmationMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("EcosystemErrorFilter") private ecosystemErrorFilter: EcosystemErrorFilter,
        private consentManager:ConsentRequestLogManager,
        private connector:DefaultConnector
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
            
            let consentRequest: ConsentRequestLog;
            try {
                consentRequest = await this.consentManager.FindAuthRequest({
                    id: consentId,
                })    
            } catch {
                res.sendStatus(404);
                return;
            }

            let updatedConsent = await this.connector.FinaliseConsent(consentRequest,params.authCode,params.idToken,params.state).GetWithHealing();
            let missingScopes = updatedConsent.MissingScopes();
            let isActive = updatedConsent.IsCurrent()
            let scopesFulfilled = (missingScopes.length == 0)

            let success = (isActive && scopesFulfilled);

            return res.json({
                scopesFulfilled: scopesFulfilled,
                requestedScopes: JSON.parse(updatedConsent.requestedScopesJson),
                missingScopes: missingScopes,
                isActive: isActive,
                success
            })
            
        } catch (err) {
            const formattedError = this.ecosystemErrorFilter.formatEcosystemError(err,"Could not exchange code for tokens at data holder");
            if (formattedError) {
                res.status(500).json(formattedError)
            } else {
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
        }
    };   

}

export {ConsentConfirmationMiddleware}