import _ from "lodash"

export interface EcosystemErrorFilter {
    formatEcosystemError: (err: any, message: string) => any
}

export const SecretiveEcosystemErrorFilter: EcosystemErrorFilter = {
    formatEcosystemError: () => undefined
}

class GenerousEcosystemErrorFilter implements EcosystemErrorFilter {
    private findAxiosError(err: any): any {
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

    private getCircularReplacer(): any {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return;
                }
                seen.add(value);
            }
            // trying to filter out the httpsAgent which cause circular ref
            if (key === 'httpsAgent' || key === '_httpMessage' || key === 'socket') {
                return;
            }
            if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'apikey') { //Mask these headers entirely
                return 'xxxxxxx REDACTED xxxxxxx';
            }
            return value;
        };
    };

    private getInnerMostError(err: any): any {
        if (err.innerError && err.innerError.lastError) {
            this.getInnerMostError(err.innerError.lastError)
        } else {
            return err
        }
    }


    public formatEcosystemError(err: any, message: String) {
        try {
            // handling internal error
            if (err.innerError) {
                // not axios error, plattern the error 
                const mostInnerError = this.getInnerMostError(err.innerError)
                err = JSON.parse(JSON.stringify(mostInnerError, this.getCircularReplacer()))
            }
            //Find embedded axios errors
            let axiosError = this.findAxiosError(err);

            let finalError = null // use for internal error
            if (!axiosError) {
                // grab out the internal error
                const { innerError = null } = err.lastError
                if (innerError) {
                    if (innerError.innerError) {
                        finalError = innerError.innerError
                    } else {
                        finalError = innerError
                    }
                }
                if (finalError === null) {
                    finalError = err
                }
            }

            let details = {
                message: message,
                source: 'ADR-Gateway' || process.env.BACKEND_ERROR_REPORTER,
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
                } : {
                    payload: finalError ? finalError.payload : null,
                    parameters: finalError ? finalError.parameters : null
                }
            };
            return details;
            
        } catch {
            return undefined;
        }
    }
}

const GenerousEcosystemErrorFilterSingleton = new GenerousEcosystemErrorFilter()
export {
    GenerousEcosystemErrorFilterSingleton as GenerousEcosystemErrorFilter
}