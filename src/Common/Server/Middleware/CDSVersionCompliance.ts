import express from "express";
import { NextFunction } from "connect";
import winston from "winston";
import {singleton, inject} from "tsyringe"
import uuid from "uuid";

@singleton()
class CDSVersionComplianceMiddleware {

    constructor(@inject("Logger") private logger: winston.Logger) {
    }

    /**
     * This middleware ensures that the Data Recipient responds to Endpoint Versioning parameters in a standards-compliant manner
     * See https://consumerdatastandardsaustralia.github.io/standards/#versioning for more information
     * @param req W
     * @param res 
     * @param next 
     */
    handle = (req:express.Request,res:express.Response,next: NextFunction) => {
        // check client certificate
    
        let xFapiId = req.headers['x-fapi-interaction-id'];

        if (typeof xFapiId == 'string') {
            res.setHeader('x-fapi-interaction-id',xFapiId);
        } else {
            res.setHeader('x-fapi-interaction-id',uuid.v4());
        }

        let xvOK:boolean = (():boolean => {
            // Accept request only if x-v = 1
            let xv = req.headers["x-v"];
            if (typeof xv == 'string') {
                if (xv != "1") {
                    return false;
                }
            } else {
                return false;
            }
    
            // Accept request only if x-min-v is 1 or not sent
            let xvMin = req.headers["x-min-v"];
            if (typeof xvMin == 'string') {
                if (xvMin != "1") {
                    return false;
                }
            } else if (typeof xvMin != 'undefined') {
                return false;
            }
    
            return true;
        })();

        let acceptTypesOK:boolean = (():boolean => {
            // Accept request only if x-v = 1
            let accept = req.headers['accept'];
            if (typeof accept == 'string') {
                if (accept != "application/json") {
                    return false;
                }
            }    
   
            return true;
        })();


        let contentTypesOK:boolean = (():boolean => {   
            // Accept request only if x-min-v is 1 or not sent
            let contentType = req.headers['content-type'];
            if (typeof contentType == 'string') {
                if (contentType != "application/json") {
                    return false;
                }
            }
    
            return true;
        })();
    
        if (!(xvOK && acceptTypesOK && contentTypesOK)) {
            if (!contentTypesOK) {
                res.statusCode = 400
                res.statusMessage = "Not Acceptable"
                res.send()    
            } else {
                res.statusCode = 406
                res.statusMessage = "Not Acceptable"
                res.send()    
            }
        } else {
            next();
        }        
    };   

}

export {CDSVersionComplianceMiddleware}