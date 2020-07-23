import express, { response } from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { AxiosRequestConfig, AxiosError, AxiosResponse } from "axios";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, query, param, body } from "express-validator";
import { DataHolderMetadataProvider, DataholderMetadata, Dataholder, DataholderOidcMetadata } from "../../Services/DataholderMetadata";
import * as _ from "lodash";
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AdrGatewayConfig } from "../../Config";
import { DefaultConnector } from "../Connectivity/Connector.generated";
import { axios } from "../../../Common/Axios/axios";
import { URL } from "url";
import { DataholderOidcResponse } from "../Connectivity/Types";

interface UserInfoRequestParams {
    consentId: number
}

class UserInfoAccessError extends Error {
    constructor(public err:any, public res?:AxiosResponse<any>) {
        super()
    }
}

@injectable()
class UserInfoProxyMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<Dataholder>,
        @inject("ClientCertificateInjector") private clientCertInjector:ClientCertificateInjector,
        @inject("AdrGatewayConfig") private config:(() => Promise<AdrGatewayConfig>),
        private consentManager:ConsentRequestLogManager,
        private connector:DefaultConnector
    ) { }

    GetActiveConsent = async (consentId: number) => {
        return await this.consentManager.GetConsent(consentId)
    }

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }

        let Responder = async (req:express.Request,res:express.Response) => {

   
            let m = <any>matchedData(req);

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
                    consent = await this.connector.ConsentCurrentAccessToken(consent).GetWithHealing()
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
  
            try {
                await this.connector.UserInfoAccessCredentials(consent).GetWithHealing({
                    validator: async (o) => {
                        await this.ForwardRequest(o.DataHolderOidc,o.Consent,req,res);
                        return true;
                    }
                });
            } catch (err) {
                this.logger.error("UserInfoAccess error",err)
                res.status(500).send();
            }

        };
    
        // TODO add client authorization
        return _.concat(
            [
                param('consentId').isInt({min:1}).bail(),
                validationErrorMiddleware,
                Responder
            ])
    }


    
    ForwardRequest = async (dh: DataholderOidcResponse, consent: ConsentRequestLog, req: express.Request, res:express.Response) =>{

        let url = new URL(await dh.userinfo_endpoint)

        let headers = <any>{
            "content-type":"application/json",
            "accept":"application/json",
            Authorization: `Bearer ${consent.accessToken}`
        }

        let options:AxiosRequestConfig = {
            method: "GET",
            url: url.toString(),
            headers: headers,
            responseType:"json"
        }

        this.clientCertInjector.inject(options);

        try {
            let dhRes = await axios.request(options);
            if (dhRes.status == 200) {
                return res.json(dhRes.data)
            } else {
                throw 'Unexpected userInfo access error'
            }
        } catch (e) {
            throw new UserInfoAccessError(e);
        }

    }

}

export {UserInfoProxyMiddleware}