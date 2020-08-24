import { TestAction, TestActionResult } from "./TestActions";
import { response } from "express";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import _ from "lodash"
import { axios } from "../../../Common/Axios/axios";
import https from "https"
import { logger } from "../../Logger";

export const TransformMtlsOptions = (config:AxiosRequestConfig) => {
    let mtlsOptions = _.pick(config,'key','cert','ca','passphrase');
    config = _.omit(config,'key','cert','ca','passphrase')
    if (Object.keys(mtlsOptions).length > 0) {
        config.httpsAgent = new https.Agent(_.merge({},mtlsOptions))

    }
    return config;
}

export interface DoRequestResult extends TestActionResult {
    response: any;
    error: any;
    body: any;
}

export class DepaginateRequestResult implements TestActionResult {
    responses: AxiosResponse<any>[];
    error: any;
    dataValues: any[];

    Collate = (fn:(dv:any)=>any) => {
        return _.flatten(_.map(this.dataValues,dv => fn(dv)))
    }

    constructor(o:{error:any, responses:AxiosResponse<any>[], dataValues:any[]}) {
        this.responses = o.responses
        this.error = o.error
        this.dataValues = o.dataValues
    }
}

class DoRequest extends TestAction<DoRequestResult> {
    Perform = async (): Promise<DoRequestResult> => {
        logger.debug("DoRequest with request options:");
        logger.debug(this.parameters.requestOptions)
        const p = new Promise<DoRequestResult>(async (resolve,reject) => {
            try {
                let requestOptions = TransformMtlsOptions(this.parameters.requestOptions)
                let response = await axios.request(requestOptions);
                resolve({error:undefined, response: response,body:response.data})
            } catch (e) {
                resolve({error:e, response: e?.response,body:e?.response?.data})
            }
        });

        return await p;

    }
    parameters!: {
        requestOptions: AxiosRequestConfig
    }

    static Options = (config: AxiosRequestConfig & {key?:any, cert?:any, ca?:any, passphrase?:any}):{requestOptions:AxiosRequestConfig} => {
        return {requestOptions:config}
    }
}

export class DepaginateRequest extends TestAction<DepaginateRequestResult> {

    static Options = (config: AxiosRequestConfig & {key?:any, cert?:any, ca?:any, passphrase?:any}, paginationPageLimit:number, direction: "FORWARDS" | "BACKWARDS" = "FORWARDS"):{requestOptions:AxiosRequestConfig,paginationPageLimit:number,direction: "FORWARDS" | "BACKWARDS"} => {
        return {requestOptions:config,paginationPageLimit, direction}
    }

    responses:AxiosResponse<any>[] = [];
    dataValues:any[] = [];

    Perform = async (): Promise<DepaginateRequestResult> => {
        logger.debug("DepaginateRequest with request options:");
        logger.debug(this.parameters.requestOptions)

        const p = new Promise<DepaginateRequestResult>(async (resolve,reject) => {
            try {
                let expectedPages: number|undefined = undefined;
                let pageCount = 0;
                while (true) {
                    let thisRequestOptions = TransformMtlsOptions(_.cloneDeep(this.parameters.requestOptions));
                    let response = await axios.request(thisRequestOptions);
                    this.responses.push(response)
                    if (this.parameters.direction === "FORWARDS") {
                        this.dataValues.push(response.data.data);
                    } else {
                        this.dataValues.unshift(response.data.data);
                    }
                    pageCount++;
                    let expected = response.data.meta.totalPages || expectedPages || 1
                    if (pageCount > expected) {
                        throw `Expected ${expected} but received ${pageCount}`
                    }
                    if (this.parameters.direction === "FORWARDS") {
                        if (response.data.links?.next) {
                            this.parameters.requestOptions.params = {}
                            this.parameters.requestOptions.url = response.data.links?.next
                        } else {
                            break;
                        }
                    } else { // BACKWARDS
                        if (response.data.links?.prev) {
                            this.parameters.requestOptions.params = {}
                            this.parameters.requestOptions.url = response.data.links?.prev
                        } else {
                            break;
                        }
                    }
                }
                resolve(new DepaginateRequestResult({error:undefined, responses:this.responses, dataValues:this.dataValues}))
            } catch (e) {
                if (e?.response) this.responses.push(e.response);
                resolve(new DepaginateRequestResult({error:e, responses:this.responses, dataValues:this.dataValues}))
            }
        });

        return await p;

    }
    parameters!: {
        requestOptions: AxiosRequestConfig
        paginationPageLimit: number;
        direction: "FORWARDS" | "BACKWARDS"
    }
}

export {DoRequest}