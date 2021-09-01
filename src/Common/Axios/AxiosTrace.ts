import "reflect-metadata";

import { injectable } from "tsyringe";
import _ from "lodash"

@injectable()
class TraceRecorder {
    findAxiosError(err: any): any {
        if (err.isAxiosError) {
            return err;
        } else {
            var axiosError;
            _.forOwn(err, (value, key) => {
                if (typeof (value) == 'object' && value !== null) {
                    if (value.isAxiosError) {
                        axiosError = value;
                    } else {
                        axiosError = this.findAxiosError(value);
                    }
                }
            });
            return axiosError;
        }
    }

    getCircularReplacer(): any {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return;
                }
                seen.add(value);
            }
            // trying to filter out the httpsAgent which cause circular ref
            if(key === 'httpsAgent'){
                return;
            }
            if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'apikey') { //Mask these headers entirely
                return 'xxxxxxx REDACTED xxxxxxx';
            }
            return value;
        };
    };

    getInnerMostError(err: any): any {
        if (err.innerError && err.innerError.lastError) {
            this.getInnerMostError(err.innerError.lastError)
        } else {
            return err
        }
    }


    formatErrorTrace(err: any, message: String) {
        // handling internal error
        if (err.innerError) {
            // not axios error, plattern the error 
            const mostInnerError = this.getInnerMostError(err.innerError)
            err = JSON.parse(JSON.stringify(mostInnerError, this.getCircularReplacer()))  
        }
        //Find embedded axios errors
        let axiosError = this.findAxiosError(err);


        let details = {
            message: message,
            source: 'Dr G',
            type: axiosError ? 'dependency' : 'internal',
            trace: axiosError ? {
                step: axiosError.node,
                request: {
                    url: axiosError.config.url,
                    data: axiosError.config.data,
                    method: axiosError.config.method,
                    headers: _.forOwn(axiosError.config.headers, (headerValue, headerKey) => {
                        if (_.indexOf(['authorization'], headerKey.toLowerCase()) != -1) { //Mask these headers entirely
                            axiosError.config.headers[headerKey] = 'xxxxxxx REDACTED xxxxxxx'
                        }
                    })
                },
                response: {
                    status: axiosError.response.status,
                    statusText: axiosError.response.statusText,
                    data: axiosError.response.data,
                    respHeaders: axiosError.response.headers,
                }
            } : {}
        };
        return details;
    }
}

export { TraceRecorder }