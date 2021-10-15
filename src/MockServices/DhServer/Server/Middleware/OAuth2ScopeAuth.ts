import express from "express";
import { NextFunction } from "connect";
import { GatewayRequest, Dictionary } from "../../../../Common/Server/Types";
import winston from "winston";
import { IncomingMessage } from "http";
import { CdsScope } from "../../../../Common/SecurityProfile/Scope";
import moment from "moment";
import { Consent, ConsentManager } from "../../Entities/Consent";
import _ from "lodash";
import { inject, singleton } from "tsyringe";
import { HttpCodeError, ErrorPayload, isHttpCodeError, formatErrorPayload} from "../../../../Common/Server/ErrorHandling";
import { ExtractBearerToken, SingleHeader } from "../../../../Common/Server/Validation";
import { DhGatewayRequest } from "../Types";

class BadDateError extends Error {
    constructor() {
        super()
    }
}

function GetRequiredResourceRequestHeaders(req:IncomingMessage) {
    const authDateValue = SingleHeader(req,'x-fapi-auth-date')

    if (!(/^\w\w\w, \d\d \w\w\w \d\d\d\d \d\d:\d\d:\d\d GMT$/.test(authDateValue))) {
        throw new BadDateError()   
    }

    return {
        bearerToken: ExtractBearerToken(SingleHeader(req,'authorization')),
        xCdsSubject: undefined, // removed as per https://consumerdatastandardsaustralia.github.io/standards/includes/releasenotes/releasenotes.1.1.1.html#high-level-standards
        xFapiAuthDate: moment.utc(authDateValue,'ddd, DD MMM YYYY, HH:mm:ss [GMT]').toDate(),
    }
}

function GetRequiredUserInfoRequestHeaders(req:IncomingMessage) {
    return {
        bearerToken: ExtractBearerToken(SingleHeader(req,'authorization')),
        xCdsSubject: undefined, // removed as per https://consumerdatastandardsaustralia.github.io/standards/includes/releasenotes/releasenotes.1.1.1.html#high-level-standards
        xFapiAuthDate: undefined,
    }
}


class ConsumerUnauthorisedError extends HttpCodeError{
    constructor(logmessage:string) {
        super(logmessage,401)
    }
}

export class ConsumerForbiddenError extends HttpCodeError{
    constructor(logmessage:string, payload: ErrorPayload) {
        super(logmessage,403,payload)
    }
}


class ConsumerTokenError extends ConsumerUnauthorisedError{
    constructor(logmessage:string) {
        super("Check token expiry, revocation status and x-cds-subject.")
    }
}

class ConsumerScopeError extends ConsumerForbiddenError{
    constructor(logmessage:string, meta?: object) {
        let payload = _.merge({
            code: "SCOPE_MISMATCH",
            detail: "This request is not allowed for this consent.",
            },{meta:meta});
        super(logmessage,payload);
    }
}


class HokBoundTokenScopeVerificationMiddleware {

    constructor(private scope:CdsScope, @inject("Logger") private logger: winston.Logger, private consentManager: ConsentManager) {
    }

    verify = async (thumbprint:string|undefined, params:(ReturnType<typeof GetRequiredResourceRequestHeaders>|ReturnType<typeof GetRequiredUserInfoRequestHeaders>)) => {
        if (typeof thumbprint != 'string') throw new Error("Client Cert Thumbprint from MTLS middleware is unavailable");

        // find an active (unexpired, non-revoked) token with the x-cds-subject header also matching
       
        let consent:Consent;
        try {
            consent = await this.consentManager.getActiveConsentByAccessToken(params.bearerToken,thumbprint,params.xCdsSubject);
        } catch (err) {
            throw new ConsumerTokenError("Could not locate token")
        }

        if (typeof consent.scopesJson != 'string') throw new ConsumerScopeError("Authorized scopes could not be determined")
        if (!_.includes(JSON.parse(consent.scopesJson),this.scope)) throw new ConsumerScopeError("Request made with invalid scope")

        return consent;
    }

    /**
     * This middleware ensures that the Data Recipient responds to Endpoint Versioning parameters in a standards-compliant manner
     * See https://consumerdatastandardsaustralia.github.io/standards/#versioning for more information
     * @param req 
     * @param res 
     * @param next 
     */
    handler = (requestType:"UserInfo"|"Resource") => {
        return async (req:IncomingMessage,res:express.Response,next: NextFunction) => {

            // extract client ID from header
            let thumbprint:string|undefined = (req as GatewayRequest).gatewayContext?.clientCert?.thumbprint;
            
            let authParams;
            try {
                if (requestType == "UserInfo"){
                    authParams = GetRequiredUserInfoRequestHeaders(req);
                } else if (requestType == "Resource") {
                    authParams = GetRequiredResourceRequestHeaders(req);
                } else {
                    throw 'Invalid request type';
                }
            } catch (err) {
                if (err instanceof BadDateError) {
                    res.status(400);
                    res.json({
                        error: "x-fapi-auth-date must be as per rfc7231 7.1.1.1"
                    })
                }

                res.status(401);
                this.logger.warn("Required auth params not supplied",err);
                res.send();
                return;
            }
    
            try {
                (<any>req as DhGatewayRequest).gatewayContext.consent = await this.verify(thumbprint,authParams)
            } catch (err) {
                if (isHttpCodeError(err)) {
                    this.logger.warn(err.message,err);
                    res.status(err.httpCode)
                    let payload = err.payload;
                    if (payload) {res.json(formatErrorPayload(payload))};
                    res.send();
                    return;    
                } else {
                    this.logger.error(err.message,err);
                    res.status(500).send();
                    return;
                }
            }
    
            next();
        };   
    }
}

@singleton()
class HokBoundTokenScopeVerificationFactory {
    constructor(@inject("Logger") private logger: winston.Logger, private consentManager: ConsentManager) {

    }
    
    make(scope:CdsScope) {
        let m = new HokBoundTokenScopeVerificationMiddleware(scope, this.logger, this.consentManager);
        return m;
    }
}

export {HokBoundTokenScopeVerificationFactory}