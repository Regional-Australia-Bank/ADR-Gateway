
import convict = require("convict");
import { MtlsConfig } from "../../../AdrGateway/Config";
import { JWKS } from "jose";

export interface MockRegisterConfig{
    Port: number,
    Jwks: string | JWKS.KeyStore,
    MockDhBaseUri: string,
    MockDhBaseMtlsUri: string,
    FrontEndUrl:string,
    FrontEndMtlsUrl:string,
    mtls?: MtlsConfig
    TestAdr: {
        Jwks: string | JWKS.KeyStore,
        BrandId: string
        ProductId: string
    }
}

export const GetConfig = (configFile?:string):MockRegisterConfig => {
    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8301,
            env: 'PORT'
        },
        Jwks: {
            doc: 'The Jwks',
            format: 'String',
            default: "mock-register.private.jwks.json",
            env: 'JWKS'
        },
        MockDhBaseUri: {
            doc: 'Where can the Mock DH be accessed',
            format: 'url',
            default: "http://localhost:8201",
            env: 'MOCKDH_BASE_URI'
        },
        MockDhBaseMtlsUri: {
            doc: 'Where can the Mock DH be accessed',
            format: 'url',
            default: "https://localhost:10202",
            env: 'MOCKDH_BASE_MTLS_URI'
        },
        FrontEndUrl: {
            doc: 'The URL for prefixing OIDC values',
            format: 'url',
            default: "http://localhost:8301",
            env: 'FRONT_END_URI'
        },
        FrontEndMtlsUrl: {
            doc: 'The URL for prefixing OIDC values for MTLS endpoints',
            format: 'url',
            default: "http://localhost:8301",
            env: 'FRONT_END_MTLS_URI'
        },
        mtls: {
            key: {
                doc: 'Location of the client cert key',
                format: 'String',
                default: "file:..\\adr-gateway\\client.key.pem",
                env: 'CLIENT_CERT_KEY'
            },
            cert: {
                doc: 'Location of the client cert certificate',
                format: 'String',
                default: "file:..\\adr-gateway\\client.cert.pem",
                env: 'CLIENT_CERT_CERT'
            },
            ca: {
                doc: 'Location of the client cert ca',
                format: 'String',
                default: "file:..\\adr-gateway\\ca.cert.pem",
                env: 'CLIENT_CERT_CA'
            },
            passphrase: {
                doc: 'Location of the client cert passphrase',
                format: 'String',
                default: "",
                env: 'CLIENT_CERT_PASSPHRASE'
            },
        },
        TestAdr:{
            Jwks: {
                doc: 'The Jwks for the Testing Adr Gateway',
                format: 'String',
                default: "..\\adr-gateway\\adrgw.private.jwks.json",
                env: 'TEST_ADR_JWKS'
            },
            BrandId: {
                doc: 'The Brand ID of the Data Recipient',
                format: 'String',
                default: "",
                env: 'TEST_ADR_BRAND_ID'
            },
            ProductId: {
                doc: 'The Product ID of the Data Recipient',
                format: 'String',
                default: "",
                env: 'TEST_ADR_PRODUCT_ID'
            },
        }      
    })

    config.validate({allowed: 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}