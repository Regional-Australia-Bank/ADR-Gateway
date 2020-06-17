import express, { response } from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { AxiosResponse, AxiosRequestConfig, AxiosError } from "axios";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, query, param, body } from "express-validator";
import {toBoolean} from 'validator';
import { DataHolderMetadataProvider, DataholderMetadata, Dataholder } from "../../Services/DataholderMetadata";
import * as _ from "lodash";
import uuid from "uuid";
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { IncomingMessage } from "http";
import { Dictionary } from "../../../Common/Server/Types";
import { AdrGatewayConfig } from "../../Config";
import { CatchPromiseRejection } from "./ErrorHandling";
import { DefaultPathways } from "../Connectivity/Pathways";
import { axios } from "../../../Common/Axios/axios";
import { URL } from "url";

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
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<Dataholder>,
        @inject("ClientCertificateInjector") private clientCertInjector:ClientCertificateInjector,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        private consentManager:ConsentRequestLogManager,
        private pw: DefaultPathways
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
                return res.sendStatus(404).json("Consent does not exist")
            }

            let dataholder: Dataholder
            try {
                dataholder = await this.dataHolderMetadataProvider.getDataHolder(consent.dataHolderId)
            } catch {
                return res.sendStatus(500).json("Could not retrive dataholder metadata")
            }

            if (!consent.HasCurrentAccessToken()) {
                if (consent.HasCurrentRefreshToken()) {
                    consent = await this.pw.ConsentCurrentAccessToken(consent).GetWithHealing()
                } else {
                    if (consent.SharingDurationExpired()) {
                        return res.status(403).json("Consent has expired with the end of the sharing period")
                    } else if (consent.RefreshTokenExpired()) {
                        return res.status(403).json("Refresh token has expired before the end of the sharing period")
                    } else {
                        return res.status(403).json("One time access token has expired")
                    }
                    
                }
            }
    
            // TODO pre-check the scope value to avoid unnecessary calls to the DH which can be known to fail

            // TODO forward request to data holder, injecting bearer token, x-v header and query parameters and headers from client

            try {
                await this.pw.ConsumerDataAccessCredentials(consent,resolvedResourcePath).GetWithHealing(async (o) => {
                    await this.ForwardRequest(dataholder,resolvedResourcePath,consent,params,req,res);
                    return true;
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
                CatchPromiseRejection(Responder)
            ])
    }
    
    ForwardRequest = async (dh: Dataholder, resourcePath: string, consent: ConsentRequestLog, params:DataAccessRequestParams, req: express.Request, res:express.Response) =>{

        let url = new URL("."+resourcePath,await dh.getResourceEndpoint())

        let headers = <any>{
            Authorization: `Bearer ${consent.accessToken}`,
            "x-v":"1",
            "content-type":"application/json",
            "accept":"application/json",
            "x-fapi-interaction-id":uuid.v4(),
            "x-fapi-auth-date":params.user.lastAuthenticated,
            //"x-cds-subject":consent.ppid, // removed as per https://consumerdatastandardsaustralia.github.io/standards/includes/releasenotes/releasenotes.1.1.1.html#high-level-standards
        }

        if (params.user.present) {
            headers["x-fapi-customer-ip-address"] = params.user.ipAddress
            headers["x-cds-User-Agent"] = params.user.userAgent
        }

        // forward headers from the original request where they do not overlap with those special ones above
        // for (let i = 0; i < req.rawHeaders.length; i+=2) {
        //     let key = req.rawHeaders[i];
        //     let value = req.rawHeaders[i+1]
        //     if (key.toLowerCase() != 'host') {
        //         if (typeof _.find(Object.entries(headers),e => e[0].toLowerCase() == key.toLowerCase()) === 'undefined') {
        //             headers[key] = value
        //         }    
        //     }
        // }

        // forward query string parameters

        for (let [key,value] of Object.entries(req.query)) {
            url.searchParams.append(key,<string>value)
        }

        let options:AxiosRequestConfig = {
            method: "GET",
            url: url.toString(),
            headers: headers,
            responseType:"json"
        }

        this.clientCertInjector.inject(options);

        // return res.json(options); TODO remove this line

        try {
            let dhRes = await axios.request(options);
            // for (let i = 0; i < dhRes.rawHeaders.length; i+=2) {
            //     res.setHeader(dhRes.rawHeaders[i], dhRes.rawHeaders[i+1]);
            // }

            // set the status
            res.statusCode = dhRes.status
            res.statusMessage = dhRes.statusText

            // TODO remove these headers and instead assert the equality of the sent vs. received headers
            res.setHeader('x-fapi-sent',dhRes.request.getHeader('x-fapi-interaction-id'));
            let xFapiReceived = dhRes.headers['x-fapi-interaction-id'];
            if (typeof xFapiReceived != 'string') throw 'Expected exactly one x-fapi-interaction-id header in response';
            res.setHeader('x-fapi-received',xFapiReceived);

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
            throw new ConsumerDataAccessError(err,(<AxiosError<any>>err).response);
        }
    }

}

export {ConsumerDataAccessMiddleware}