import { ConnectionOptions } from "typeorm";
import { Dictionary } from "../Common/Server/Types";
import { JWKS } from "jose";

interface AdrSoftwareClient {
    systemId: string,
    authCallbackUri: string
}

export interface MtlsConfig {
    key: string
    cert: string[] | string
    ca: string
    passphrase?: string
}

export interface AdrConnectivityConfig {
    DefaultClaims?: AdrGatewayConfig["DefaultClaims"],
    Jwks: string | JWKS.KeyStore
    mtls?: MtlsConfig,
    RegisterBaseUris: {
        Oidc: string,
        Resource: string
        SecureResource: string
    },
    DataRecipientApplication: AdrGatewayConfig["DataRecipientApplication"],
    AdrClients: AdrGatewayConfig["AdrClients"],
    Crypto?: {
        PreferredAlgorithms?: {
            id_token_encrypted_response_alg: string,
            id_token_encrypted_response_enc: string
        }[]
    }
}

export interface AdrGatewayConfig { // TODO This will be the new configuration
    DefaultClaims?: {
        userinfo?: Dictionary<any>,
        id_token?: Dictionary<any>
    },
    Database?: ConnectionOptions,
    AdrClients: AdrSoftwareClient[],
    Port: number,
    Jwks: string | JWKS.KeyStore
    DataRecipientApplication: {
        LegalEntityId:string,
        BrandId:string,
        ProductId:string
        redirect_uris:string[],
        standardsVersion: number,
        standardsVersionMinimum: number,
        uris: {
            logo_uri: string,
            tos_uri: string,
            policy_uri: string,
            jwks_uri: string,
            revocation_uri: string
        }
    }
    mtls?: MtlsConfig,
    RegisterBaseUris: {
        Oidc: string,
        Resource: string
        SecureResource: string
    },
    Logging?:{logfile:string},
    BackEndBaseUri: string
}