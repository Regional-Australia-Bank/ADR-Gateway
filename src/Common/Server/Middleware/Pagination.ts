import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import { query, matchedData } from "express-validator";
import _ from "lodash"
import { isHttpCodeError, formatErrorPayload } from "../ErrorHandling";
import { URL } from "url";

interface PaginationOptions {
    baseUrl:string | ((req:express.Request) => string)
    dataObjectName?: string,
    mtls?: true
}

interface MetaWrapOptions {
    baseUrl:string | ((req:express.Request) => string)
    mtls?: true
}

const handle = (req:express.Request,res:express.Response,next: NextFunction) => {
    next()
}

@injectable()
class PaginationMiddleware {
    constructor(
        @inject("PaginationConfig") private configFn:() => Promise<{FrontEndUrl:string,FrontEndMtlsUrl:string}>
    ) {}

    Paginate = (options:PaginationOptions) => {

        const middlewares = [
        query('page').isInt({min:1}).toInt().optional(),
        query('page-size').isInt({min:1}).toInt().optional(),
    
        async (req:express.Request,res:express.Response,next: NextFunction) => {
    
            let config = await this.configFn()

            const m = matchedData(req);
            const pageNumber = m['page'] || 1;
            const pageIndex = pageNumber - 1;
            const pageSize = m['page-size'] || 25;
    
            const lowerLimit = pageIndex * pageSize;
            const upperLimit = (pageIndex+1) * pageSize;
    
            const originalUrl = new URL('https://localhost'+req.url);
    
            const metaUrl = (page:number) => {
                let baseUrl:string;
                if (typeof options.baseUrl === 'string') {
                    baseUrl = options.baseUrl
                } else {
                    baseUrl = options.baseUrl(req)
                }
                const newUrl = new URL(baseUrl,options.mtls ? config.FrontEndMtlsUrl : config.FrontEndUrl);
                originalUrl.searchParams.forEach((v,k) => {
                    if ((k.toLowerCase() != 'page') && (k.toLowerCase() != 'page-size')) {
                        newUrl.searchParams.append(k,v);
                    }
                });
    
                newUrl.searchParams.append("page",page.toString());
                newUrl.searchParams.append("page-size",pageSize.toString())
                return newUrl.toString();
            }
    
            const originalArray = <object[]>((<any>res).responseData);
            const newArray:object[] = [];
    
            let iter = originalArray.entries();
            while (true) {
                let next = iter.next()
                if (next.done) break;
                let [index,obj] = next.value;
                if (index < lowerLimit) continue;
                if (index >= upperLimit) break;
                newArray.push(obj);
            }
    
            const totalRecords = originalArray.length;
            const totalPages = Math.ceil(totalRecords/pageSize);
            
            const firstPageNumber = 1;
            const lastPageNumber = Math.max(totalPages,firstPageNumber);
    
            const result = {
                data: <any>{},
                links: <any>{
                    first: metaUrl(firstPageNumber),
                    self: metaUrl(pageNumber),
                    last: metaUrl(lastPageNumber),
                },
                meta: {
                    totalPages: totalPages,
                    totalRecords: totalRecords
                }
            }
    
            if (typeof options.dataObjectName == 'string') {
                result.data[options.dataObjectName] = newArray;
            } else {
                result.data = newArray;
            }
    
            if (pageNumber > firstPageNumber) {
                result.links.prev = metaUrl(pageNumber - 1)
            }
    
            if (pageNumber < lastPageNumber) {
                result.links.next = metaUrl(pageNumber + 1)
            }
    
            res.status(200).json(result);
        }]
        
        return middlewares;
    }

    MetaWrap = (options:MetaWrapOptions) => {

        const middlewares = [
    
        async (req:express.Request,res:express.Response,next: NextFunction) => {
    
            let config = await this.configFn()

            const m = matchedData(req);
        
            const originalUrl = new URL('https://localhost'+req.url);
    
            const metaUrl = () => {
                let baseUrl:string;
                if (typeof options.baseUrl === 'string') {
                    baseUrl = options.baseUrl
                } else {
                    baseUrl = options.baseUrl(req)
                }
                const newUrl = new URL(baseUrl,options.mtls ? config.FrontEndMtlsUrl : config.FrontEndUrl);
                originalUrl.searchParams.forEach((v,k) => {
                    if ((k.toLowerCase() != 'page') && (k.toLowerCase() != 'page-size')) {
                        newUrl.searchParams.append(k,v);
                    }
                });
    
                return newUrl.toString();
            }
    
            if (!(<any>res).responseData) {
                console.error('No response data found while trying to wrap the data', res)
                return res.status(500).send();
            }

            const result = {
                data: (<any>res).responseData,
                links: <any>{
                    self: metaUrl()
                }
            }
        
            res.status(200).json(result);
        }]
        
        return middlewares;
    }
}

const MockDataArray = (dataFn:(req:express.Request) => object[] | Promise<object[]>) => {
    
    return async (req:express.Request,res:express.Response,next: NextFunction) => {
        try {
            const data = await dataFn(req);
            (<any>res).responseData = data;    
            next();
        } catch (e) {
            if (e.missingAccountIds) {
                return res.status(422).json({
                    errors: _.map(e.missingAccountIds, accountId => ({
                        code:"0001 – Account not able to be found",
                        title:"Invalid account",
                        detail: accountId
                    }))
                });
            }
            if (isHttpCodeError(e)) {
                // this.logger.warn(err.message,err); // TODO move this handling to a middleware or something
                res.status(e.httpCode)
                let payload = e.payload;
                if (payload) {res.json(formatErrorPayload(payload))};
                res.send();
                return;    
            }
            throw e;
        }
    };
}

const MockDataObject = (dataFn:(req:express.Request, res?: express.Response) => (object|undefined) | Promise<object|undefined>) => {
    
    return async (req:express.Request,res:express.Response,next: NextFunction) => {
        try {
            const data = await dataFn(req,res);
            (<any>res).responseData = data;
            next();                
        } catch (err) {
            if (err.unconsentedAccount) {
                return res.status(403).end()
            }
            if (isHttpCodeError(err)) {
                // this.logger.warn(err.message,err); // TODO move this handling to a middleware or something
                res.status(err.httpCode)
                let payload = err.payload;
                if (payload) {res.json(formatErrorPayload(payload))};
                res.send();
                return;    
            } else {
                throw err
            }

        }
    };
}

export {MockDataArray,MockDataObject,PaginationMiddleware}