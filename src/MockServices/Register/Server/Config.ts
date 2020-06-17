
import convict = require("convict");
import {AdrConnectivityConfig } from "../../../AdrGateway/Config";
import {JSONWebKeySet } from "jose";
import { ConvictFormats, ConvictSchema } from "../../../Common/Server/Config";
import { GenerateRegisterJwks, GenerateDrJwks } from "../../../Common/Init/Jwks";
import { Dictionary } from "../../../Common/Server/Types";

export interface MockRegisterConfig{
    Port: number,
    Jwks: JSONWebKeySet,
    FrontEndUrl:string,
    FrontEndMtlsUrl:string,
    TestDataHolders: Dictionary<string>
    TestDataRecipientJwksUri: string
    LiveRegisterProxy: {
        Jwks: AdrConnectivityConfig["Jwks"]
        mtls?: AdrConnectivityConfig["mtls"]
        BrandId: AdrConnectivityConfig["BrandId"]
        LegalEntityId: AdrConnectivityConfig["LegalEntityId"]
        RegisterBaseUris: AdrConnectivityConfig["RegisterBaseUris"]
        SoftwareProductConfigUris: AdrConnectivityConfig["SoftwareProductConfigUris"]
    }
}

export const GetConfig = (configFile?:string):MockRegisterConfig => {   
    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8301,
            env: 'REGISTER_PORT'
        },
        Jwks: {
            doc: 'The Jwks',
            format: ConvictFormats.Jwks.name,
            default: GenerateRegisterJwks().toJWKS(true),
            env: 'REGISTER_JWKS'
        },
        FrontEndUrl: {
            doc: 'The URL for prefixing OIDC values',
            format: 'url',
            default: "http://localhost:8301",
            env: 'REGISTER_FRONT_END_URI'
        },
        FrontEndMtlsUrl: {
            doc: 'The URL for prefixing OIDC values for MTLS endpoints',
            format: 'url',
            default: "http://localhost:8301",
            env: 'REGISTER_FRONT_END_MTLS_URI'
        },
        TestDataRecipientJwksUri: {
            doc: 'List of test data recipients for client authentication (brand-jwks mapping)',
            format: "url",
            default: "http://localhost:8101/jwks",
            env: 'REGISTER_TEST_DR_JWKS_URI'
        },
        TestDataHolders: {
            doc: 'List of test data holders',
            format: ConvictFormats.JsonStringDict.name,
            default: {
                "test-data-holder-1":"http://localhost:8201/mock.register.config"
            },
            env: 'REGISTER_MOCK_DHS'
        },
        LiveRegisterProxy: {
            RegisterBaseUris: {
                Oidc: {
                    doc: 'Location of the live register Oidc endpoint',
                    format: 'url',
                    default: "https://api.int.cdr.gov.au/idp",
                    env: 'PROXY_REGISTER_OIDC_URI'
                },            
                Resource: {
                    doc: 'Location of the live register resource endpoint',
                    format: 'url',
                    default: "https://api.int.cdr.gov.au/cdr-register",
                    env: 'PROXY_REGISTER_RESOURCE_URI'
                },            
                SecureResource: {
                    doc: 'Location of the live register resource endpoint (MTLS)',
                    format: 'url',
                    default: "https://secure.api.int.cdr.gov.au/cdr-register",
                    env: 'PROXY_REGISTER_SECURE_RESOURCE_URI'
                },            
            },
            Jwks: {
                doc: 'The private JWKS to use for authenticating with the live register',
                format: ConvictFormats.Jwks.name,
                default: GenerateDrJwks().toJWKS(true),
                env: 'ADR_JWKS'
            },
            mtls: ConvictSchema.Mtls,
            LegalEntityId: {env: 'ADR_LEGAL_ENTITY_ID', format:'String', default: undefined},
            BrandId: {env: 'ADR_BRAND_ID', format:'String', default: undefined},
            SoftwareProductConfigUris: {
                format: ConvictFormats.SoftwareProductConfigUris.name,
                default: {
                    sandbox: "http://localhost:8401/software.product.config"
                },
                env: "PROXY_ADR_SOFTWARE_PRODUCT_CONFIG_URIS"
            },        
        }
    })

    config.load({LiveRegisterProxy:{mtls: (process.env.ADR_MTLS_OPTIONS && JSON.parse(process.env.ADR_MTLS_OPTIONS)) || {} }})

    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}