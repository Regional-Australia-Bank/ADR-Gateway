import { IClientCertificateVerificationConfig, ConvictFormats, ConvictSchema } from "../../../Common/Server/Config";
import { Dictionary } from "../../../Common/Server/Types";
import { ConnectionOptions } from "typeorm";
import { JWKS, JSONWebKeySet } from "jose";
import urljoin from "url-join"
import _ from "lodash"
import convict = require("convict");
import { GenerateDhJwks } from "../../../Common/Init/Jwks";
import { url } from "inspector";
import { MtlsConfig } from "../../../AdrGateway/Config";
import { TestPKI } from "../../../Tests/EndToEnd/Helpers/PKI";

export interface DhServerConfig {
    Port: number,
    SecurityProfile: {
        ClientCertificates: IClientCertificateVerificationConfig,
        JoseApplicationBaseUrl: string
        AudienceRewriteRules: Dictionary<string>
    },
    Database?: ConnectionOptions,
    RegisterJwksUri: string,
    Jwks: JSONWebKeySet,
    mtls?: MtlsConfig
    Logging?: { logfile: string },
    AuthorizeUrl: string
    FrontEndUrl: string
    FrontEndMtlsUrl: string
    oidcConfiguration?: object
}

export const GetConfig = async (configFile?:string):Promise<DhServerConfig> => {
    let certs = await TestPKI.TestConfig()

    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8201,
            env: 'DH_PORT'
        },
        mtls: {
            key: {
                default: certs.client.key,
                format: ConvictFormats.StringArrayOrSingle.name
            },
            cert: {
                default: certs.client.certChain,
                format: ConvictFormats.StringArrayOrSingle.name
            },
            ca: {
                default: certs.caCert,
                format: ConvictFormats.StringArrayOrSingle.name
            },
        },
        SecurityProfile: {
            ClientCertificates: {
                Headers:{
                    ThumbprintHeader: {
                        doc: 'Where to find the validated client certificate thumbprint',
                        format: 'String',
                        default: "x-cdrgw-cert-thumbprint",
                        env: "DH_CLIENT_CERT_THUMBPRINT_HEADER"
                    }
                },
            },
            JoseApplicationBaseUrl: {
                doc: 'Base Url clients will use to populate the audience claims',
                format: 'String',
                default: "https://localhost:10201",
                env: "DH_JOSE_APPLICATION_BASE_URL"
            },
            AudienceRewriteRules: {
                doc: 'A dictionary of linking the endpoint to the public endpoint relative to JoseApplicationBaseUrl e.g. {"/revoke":"/affordability/security/revoke"}',
                format: ConvictFormats.JsonStringDict.name,
                default: {'/revoke':'/revoke'},
                env: "DH_JOSE_AUDIENCE_MAP"
            }
        },
        Jwks: {
            doc: 'The Jwks',
            format: ConvictFormats.Jwks.name,
            default: GenerateDhJwks().toJWKS(true),
            env: 'DH_JWKS'
        },
        FrontEndUrl: {
            doc: 'Where the Mock DH TLS endpoints can be accessed by the ecosystem',
            format: 'url',
            default: "https://localhost:10201",
            env: 'DH_FRONTEND_URL'
        },
        FrontEndMtlsUrl: {
            doc: 'Where the Mock DH MTLS endpoints can be accessed by the ecosystem',
            format: 'url',
            default: "https://localhost:10202",
            env: 'DH_FRONTEND_MTLS_URL'
        },
        AuthorizeUrl: {
            doc: 'The public URL of the authorize endpoint',
            format: 'url',
            default: "https://localhost:10201/authorize",
            env: 'DH_OIDC_AUTHORIZATION_ENDPOINT'
        },
        RegisterJwksUri: {
            doc: 'Where to access the CDR Register JWKS',
            format: 'url',
            default: "http://localhost:8301/oidc/jwks",
            env: 'DH_REGISTER_JWKS_URI'
        },
        oidcConfiguration: {
            "authorization_endpoint": {env: 'DH_OIDC_AUTHORIZATION_ENDPOINT', default: 'https://localhost:10201/authorize',format:'url', doc: 'Where the authorization_endpoint is served to the ecosystem'},
            "token_endpoint": {env: 'DH_OIDC_TOKEN_ENDPOINT', default: 'https://localhost:10202/idp/token',format:'url', doc: 'Where the token_endpoint is served to the ecosystem'},
            "introspection_endpoint": {env: 'DH_OIDC_INTROSPECTION_ENDPOINT', default: 'https://localhost:10202/idp/token/introspect',format:'url', doc: 'Where the introspection_endpoint is served to the ecosystem'},
            "revocation_endpoint": {env: 'DH_OIDC_REVOKE_ENDPOINT', default: 'https://localhost:10202/idp/token/revoke',format:'url', doc: 'Where the revocation_endpoint is served to the ecosystem'},
            "userinfo_endpoint": {env: 'DH_OIDC_USERINFO_ENDPOINT', default: 'https://localhost:10202/userinfo',format:'url', doc: 'Where the userinfo_endpoint is served to the ecosystem'},
            "registration_endpoint": {env: 'DH_OIDC_DCR_ENDPOINT', default: 'https://localhost:10202/idp/register',format:'url', doc: 'Where the registration_endpoint is served to the ecosystem'},
            "jwks_uri": {env: 'DH_OIDC_JWKS_ENDPOINT', default: 'http://localhost:8201/jwks',format:'url', doc: 'Where the jwks_uri is served to the ecosystem'},
        },
        Database: ConvictSchema.Database
    })

    config.load({Database: (process.env.DH_DATABASE_OPTIONS && JSON.parse(process.env.DH_DATABASE_OPTIONS)) || {} })

    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
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