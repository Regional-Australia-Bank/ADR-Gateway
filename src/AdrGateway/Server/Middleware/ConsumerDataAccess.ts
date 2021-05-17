import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { AxiosResponse, AxiosRequestConfig } from "axios";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../../Common/Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, param } from "express-validator";
import _ from "lodash";
import uuid from "uuid";
import { ClientCertificateInjector } from "../../../Common/Services/ClientCertificateInjection";
import { Dictionary } from "../../../Common/Server/Types";
import { AdrGatewayConfig } from "../../Config";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { axios } from "../../../Common/Axios/axios";
import { URL } from "url";
import urljoin from "url-join";
import { DataHolderRegisterMetadata } from "../../../Common/Connectivity/Types";

interface DataAccessRequestParams {
    user: {
        present: boolean,
        lastAuthenticated: string,
        ipAddress: string,
        userAgent: string
    }
    backendBaseUri:string
    consentId: number
}

const headerSchema:Schema = {
    "x-adrgw-present": {isBoolean: {errorMessage: "must be boolean"}, toBoolean: true},
    "x-adrgw-last-authenticated": {isISO8601: {errorMessage: "must be and ISO8601 date time"}},
    "x-adrgw-ip-address": {isIP:{errorMessage: "must be an IP address"}, optional: true},
    "x-adrgw-user-agent": {isString:{errorMessage: "must be a string value"}, optional: true},
    "x-adrgw-backend-base": {isURL:{errorMessage: "must be a URL", options:{require_tld:false}}, optional: true},
    "": {custom: {
        options: async (value):Promise<boolean> => {
            if (value.present) {
                if (!value.ipAddress) throw 'x-adrgw-ipAddress must be supplied when x-adrgw-present'
                if (!value.userAgent) throw 'x-adrgw-userAgent must be supplied when x-adrgw-present'
            }
            return true;
        }
      }},
};

class ConsumerDataAccessError extends Error {
    constructor(public err:any, public res?:AxiosResponse<any>) {
        super()
    }
}

@injectable()
class ConsumerDataAccessMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("ClientCertificateInjector") private clientCertInjector:ClientCertificateInjector,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        private consentManager:ConsentRequestLogManager,
        private connector: DefaultConnector
    ) { }

    GetActiveConsent = async (consentId: number) => {
        return await this.consentManager.GetConsent(consentId)
    }

    handler = (resourcePath: string | ((x:Dictionary<string>) => string), scope:string) => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }

        let Responder = async (req:express.Request,res:express.Response) => {
            let resolvedResourcePath:string;
            if (typeof resourcePath == 'string') {
                resolvedResourcePath = resourcePath
            } else {
                resolvedResourcePath = resourcePath(req.params)
            }
    
            let m = <any>matchedData(req);
            let params:DataAccessRequestParams = {
                consentId: m.consentId,
                user: {
                    lastAuthenticated: m["x-adrgw-last-authenticated"],
                    present: m["x-adrgw-present"],
                    userAgent: m["x-adrgw-user-agent"],
                    ipAddress: m["x-adrgw-ip-address"],
                },
                backendBaseUri: m["x-adrgw-backend-base"]
            }

            let consent:ConsentRequestLog;
            try {
                consent = await this.GetActiveConsent(m.consentId);
            } catch {
                return res.status(404).json("Consent does not exist")
            }

            if (!consent.HasCurrentAccessToken()) {
                if (consent.HasCurrentRefreshToken()) {
                    try {
                        consent = await this.connector.ConsentCurrentAccessToken(consent).GetWithHealing()
                    } catch {
                        return res.status(500).json("Unable to get access token")
                    }
                } else {
                    if (consent.revocationDate) {
                        return res.status(403).json(`Consent was revoked at ${consent.revokedAt}`)
                    } else if (consent.SharingDurationExpired()) {
                        return res.status(403).json("Consent has expired with the end of the sharing period")
                    } else if (consent.RefreshTokenExpired()) {
                        return res.status(403).json("Refresh token has expired before the end of the sharing period")
                    } else if ((!consent.refreshToken) && consent.AccessTokenExpired()) {
                        return res.status(403).json("One time access token has expired")
                    } else {
                        return res.status(403).json("No current access or refresh token for unknown reason")
                    }
                    
                }
            }
    
            try {
                await this.connector.ConsumerDataAccessCredentials(consent,resolvedResourcePath).GetWithHealing({
                    validator: async (o) => {
                        await this.ForwardRequest(o.DataHolderBrandMetadata,resolvedResourcePath,o.Consent,params,req,res);
                        return true;
                    }
                });
            } catch (err) {
                this.logger.error("ConsumerDataAccess error",err)
                res.status(500).send();
            }

        };
    
        // TODO add client authorization
        return _.concat(
            checkSchema(headerSchema,['headers']),
            [
                param('consentId').isInt({min:1}).bail(),
                validationErrorMiddleware,
                // Responder
                Responder
            ])
    }
    
    ForwardRequest = async (dh: DataHolderRegisterMetadata, resourcePath: string, consent: ConsentRequestLog, params:DataAccessRequestParams, req: express.Request, res:express.Response) =>{

        let url = new URL(urljoin(dh.endpointDetail.resourceBaseUri,resourcePath))

        // forward query string parameters
        for (let [key,value] of Object.entries(req.query)) {
            url.searchParams.append(key,<string>value)
        }
        
        let requestId = uuid.v4(); //default if none valid supplied
        let suppliedRequestId = req.header("x-fapi-interaction-id");
        if (typeof suppliedRequestId === "string" && suppliedRequestId.length) {
            requestId = suppliedRequestId
        }

        let headers = <any>{
            Authorization: `Bearer ${consent.accessToken}`,
            "x-v":"1",
            "content-type":"application/json",
            "accept":"application/json",
            "x-fapi-interaction-id":requestId,
            "x-fapi-auth-date":params.user.lastAuthenticated,
        }

        if (params.user.present) {
            headers["x-fapi-customer-ip-address"] = params.user.ipAddress
            headers["x-cds-User-Agent"] = params.user.userAgent
        }


        let options:AxiosRequestConfig = {
            method: <AxiosRequestConfig["method"]>req.method,
            data: req.body,
            url: url.toString(),
            headers: headers,
            responseType:"json"
        }

        this.logger.debug({
            requestStatus: "sending",
            consentId: consent.id,
            url: url.toString(),
            method: <AxiosRequestConfig["method"]>req.method,
            requestId,
            headers,
        })

        options = this.clientCertInjector.inject({
            softwareProductId:consent.softwareProductId,
            ...options
        });

        try {
            let dhRes = await axios.request(options);

            // set the status
            res.statusCode = dhRes.status
            res.statusMessage = dhRes.statusText

            let xFapiReceived = dhRes.headers['x-fapi-interaction-id'];
            res.set('x-fapi-interaction-id',xFapiReceived);
            if (xFapiReceived !== requestId) {
                res.set('x-fapi-interaction-id-expected',requestId);
                throw 'x-fapi-interaction-id in response did not match request';
            }
            if (typeof xFapiReceived != 'string') throw 'Expected exactly one x-fapi-interaction-id header in response';

            let body:{links:any} = dhRes.data;

            if (body.links) {
                let newLinks:Dictionary<string> = {};
                for (let [k,v] of Object.entries(body.links)) {
                    if (typeof v == 'string') {
                        let oldUrl = new URL(v);
                        // "." is necessary to make a relative URL
                        let config = (await this.config());
                        let configuredBackendBase = config.BackEndBaseUri;
                        let newUrl = params.backendBaseUri ? new URL(params.backendBaseUri) : new URL("."+req.url,configuredBackendBase);
                        newUrl.search = "";
                        oldUrl.searchParams.forEach((v,k) => {
                            newUrl.searchParams.append(k,v);
                        });
                        newLinks[k] = newUrl.toString();
                    }
                }

                body.links = newLinks;
            }

            res.json(body);

        } catch (err) {
            this.logger.debug({
                requestStatus: "failed",
                requestId,
                consentId: consent.id,
                error: err
            })
            throw new ConsumerDataAccessError(err);
        }
    }

}

export {ConsumerDataAccessMiddleware}