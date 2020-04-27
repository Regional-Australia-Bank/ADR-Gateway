import { IClientCertificateVerificationConfig } from "../../../Common/Server/Config";
import { Dictionary } from "../../../Common/Server/Types";
import { ConnectionOptions } from "typeorm";
import { JWKS } from "jose";
import urljoin from "url-join"
import _ from "lodash"

export interface DhServerConfig {
    Port: number,
    SecurityProfile: {
        ClientCertificates: IClientCertificateVerificationConfig,
        JoseApplicationBaseUrl: string
        AudienceRewriteRules: Dictionary<string>
    },
    Database?: ConnectionOptions,
    RegisterJwksUri: string,
    Jwks: string | JWKS.KeyStore,
    Logging?: { logfile: string },
    AuthorizeUrl: string
    FrontEndUrl: string
    FrontEndMtlsUrl: string
    oidcConfiguration?: object
}

interface OIDCConfiguration {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    userinfo_endpoint: string;
    registration_endpoint: string;
    jwks_uri: string;
    scopes_supported: string[]
    response_types_supported: string[];
    response_modes_supported: string[];
    grant_types_supported: string[];

    acr_values_supported: string[];
    // vot_values_supported: string[];

    subject_types_supported: string[];
    id_token_signing_alg_values_supported: string[];
    request_object_signing_alg_values_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    mutual_tls_sender_constrained_access_tokens: boolean;

    claims_supported: string[]
}

export const testIssuer = "http://test.data.holder.io"

let DefaultOIDCConfiguration: (cfg: DhServerConfig) => OIDCConfiguration = (cfg: DhServerConfig) => {
    let defaults = {
        "issuer": testIssuer,
        "authorization_endpoint": urljoin(cfg.AuthorizeUrl, "authorize"),
        "token_endpoint": urljoin(cfg.FrontEndMtlsUrl, "idp/token"),
        "introspection_endpoint": urljoin(cfg.FrontEndMtlsUrl, "idp/token/introspect"),
        "revocation_endpoint": urljoin(cfg.FrontEndMtlsUrl, "idp/token/revoke"),
        "userinfo_endpoint": urljoin(cfg.FrontEndMtlsUrl, "userinfo"),
        "registration_endpoint": urljoin(cfg.FrontEndMtlsUrl, "idp/register"),
        "jwks_uri": urljoin(cfg.FrontEndUrl, "jwks"),
        "scopes_supported": ["openid", "profile", "bank:accounts.basic:read", "bank:accounts.detail:read", "bank:transactions:read", "bank:payees:read", "bank:regular_payments:read", "common:customer.basic:read", "common:customer.detail:read"],
        "response_types_supported": ["code id_token"],
        "response_modes_supported": ["fragment"],
        "grant_types_supported": ["authorization_code", "client_credentials", "urn:openid:params:modrna:grant-type:backchannel_request"],
        "acr_values_supported": ["urn:cds.au:cdr:2", "urn:cds.au:cdr:3"],
        // "vot_values_supported": ["CL1","CL2"],
        "subject_types_supported": ["pairwise"],
        "id_token_signing_alg_values_supported": ["ES256", "PS256"],
        "request_object_signing_alg_values_supported": ["ES256", "PS256"],
        "token_endpoint_auth_methods_supported": ["private_key_jwt"],
        "mutual_tls_sender_constrained_access_tokens": true,
        "claims_supported": ["name", "given_name", "family_name", /*"vot",*/ "acr", "auth_time", "sub", "refresh_token_expires_at", "sharing_expires_at"],
        // TODO give a full list of algorithms/raise configuration errors if the JWKS does not contain supported algorithms
        "id_token_encryption_alg_values_supported": ["RSA-OAEP", "RSA-OAEP-256"],
        "id_token_encryption_enc_values_supported": ["A256GCM", "A128CBC-HS256"]
    }

    defaults = _.merge(defaults,cfg.oidcConfiguration || {})
    return defaults
}

export { OIDCConfiguration, DefaultOIDCConfiguration }