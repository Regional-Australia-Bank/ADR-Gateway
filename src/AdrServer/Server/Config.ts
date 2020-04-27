import { ConnectionOptions } from "typeorm";
import { JWKS } from "jose";
import { AdrGatewayConfig } from "../../AdrGateway/Config";

export interface AdrServerConfig {
    // TODO update with the full list, including Adr Application Details and Register location
    Database?: ConnectionOptions,
    Endpoints: {
        Revocation: string
    },
    Port: number,
    Jwks: JWKS.KeyStore | string
    mtls?: AdrGatewayConfig["mtls"]
}