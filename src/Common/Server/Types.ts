import * as express from "express"

interface Dictionary<T> {
    [key: string]: T;

}

interface GatewayContext {
    clientCert?: {
        thumbprint?: string;
    }
    verifiedBearerJwtClientId?: string | undefined
    verifiedTokenHokClientId?: string | undefined
    authorizedClientId?: string | undefined
}

interface GatewayRequest extends express.Request {
    gatewayContext: GatewayContext
}

export {Dictionary,GatewayRequest,GatewayContext}