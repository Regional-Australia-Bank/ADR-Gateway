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
                if (typeof (value) == 'object') {
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
            return {
                message: err.message,
                innerError: JSON.parse(JSON.stringify(mostInnerError, this.getCircularReplacer()))  
            }
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
                    url: axiosError.response.config.url,
                    data: axiosError.response.config.data,
                    method: axiosError.response.config.method,
                    headers: _.forOwn(axiosError.response.config.headers, (headerValue, headerKey) => {
                        if (_.indexOf(['authorization'], headerKey.toLowerCase()) != -1) { //Mask these headers entirely
                            axiosError.response.config.headers[headerKey] = 'xxxxxxx REDACTED xxxxxxx'
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