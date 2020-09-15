import { ConnectionOptions } from "typeorm";
import { Dictionary } from "../Common/Server/Types";
import { JSONWebKeySet } from "jose";
import { ConvictFormats, ConvictSchema } from "../Common/Server/Config";
import { GenerateDrJwks } from "../Common/Init/Jwks";
import { TestDataRecipientApplication } from "../MockServices/Register/MockData/DataRecipients";
import _ from "lodash"
import convict from "convict";
import { TestPKI } from "../Tests/EndToEnd/Helpers/PKI";


export interface MtlsConfig {
  key: string[] | string
  cert: string[] | string
  ca: string[] | string
  passphrase?: string
}

export interface SoftwareProductConnectivityConfig {
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
  DefaultClaims?: {
      userinfo?: Dictionary<any>,
      id_token?: Dictionary<any>
  }    
}

export interface AdrConnectivityConfig {
  Jwks: JSONWebKeySet | string,
  Database?: ConnectionOptions
  mtls?: MtlsConfig,
  DefaultClaims?: {
      userinfo?: Dictionary<any>,
      id_token?: Dictionary<any>
  },
  LegalEntityId:string,
  BrandId:string,
  RegisterBaseUris: {
      Oidc: string,
      Resource: string
      SecureResource: string
  },
  SoftwareProductConfigUris: Dictionary<string>,
  UsePushedAuthorizationRequest: Boolean,
  Crypto?: {
      IDTokenSignedResponseAlg?: string
      PreferredAlgorithms?: {
          id_token_encrypted_response_alg: string,
          id_token_encrypted_response_enc: string
      }[]
  }
}

export const ConnectivityConvictOptions = () => {
  return {
      Jwks: {
          doc: 'The private JWKS to use as a basis for signing, verifying and decryption',
          format: ConvictFormats.Jwks.name,
          default: GenerateDrJwks().toJWKS(true),
          env: 'ADR_JWKS'
      },
      Database: ConvictSchema.Database,
      mtls: ConvictSchema.Mtls,
      RegisterBaseUris: {
          Oidc: {
              doc: 'Location of the register Oidc endpoint',
              format: 'url',
              default: 'https://localhost:9301/oidc',
              env: 'ADR_REGISTER_OIDC_URI'
          },            
          Resource: {
              doc: 'Location of the register resource endpoint',
              format: 'url',
              default: 'https://localhost:9301/',
              env: 'ADR_REGISTER_RESOURCE_URI'
          },            
          SecureResource: {
              doc: 'Location of the register resource endpoint (MTLS)',
              format: 'url',
              default: 'https://localhost:9301/',
              env: 'ADR_REGISTER_SECURE_RESOURCE_URI'
          },            
      },
      DefaultClaims: {
          doc: 'Default claims to apply for new consent request',
          format: ConvictFormats.DefaultClaims.name,
          default: undefined,
          env: 'ADR_DEFAULT_CLAIMS'
      },
      UsePushedAuthorizationRequest: {env: 'ADR_USE_PAR', format:'Boolean', default: true},
      LegalEntityId: {env: 'ADR_LEGAL_ENTITY_ID', format:'String', default: TestDataRecipientApplication.LegalEntityId},
      BrandId: {env: 'ADR_BRAND_ID', format:'String', default: TestDataRecipientApplication.BrandId},
      SoftwareProductConfigUris: {
          format: ConvictFormats.SoftwareProductConfigUris.name,
          default: {
              sandbox: "http://localhost:8401/software.product.config"
          },
          env: "ADR_SOFTWARE_PRODUCT_CONFIG_URIS"
      },
      Crypto: {
          IDTokenSignedResponseAlg: {
              doc: 'Preferred algorithm for data holder to sign id tokens with',
              format: String,
              default: undefined,
              env: "ADR_ID_TOKEN_SIGNING_ALG_PREFERRED"
          },
          PreferredAlgorithms: {
              doc: 'List of algorithm sets in order of preference for id_token encryption',
              format: ConvictFormats.IdTokenEncAlgSets.name,
              default: undefined,
              env: "ADR_ID_TOKEN_SIGNING_ALG_PREFERRED"
          },
          env: "ADR_PREFERRED_ID_TOKEN_ENC_ALGS"
      }
  }
}

export const LoadMtls = async (config:convict.Config<any>) => {
  config.load({mtls: (process.env.ADR_MTLS_OPTIONS && JSON.parse(process.env.ADR_MTLS_OPTIONS)) || {} })

  if (process.env.MOCK_TLS_PKI === "1") {
      // const { TestPKI } = require("../Tests/EndToEnd/Helpers/PKI");
      try {
          let certs = await TestPKI.TestConfig();
          config.set('mtls.key',_.filter(_.concat(config.get('mtls.key'),certs.client.key)))
          config.set('mtls.cert',_.filter(_.concat(config.get('mtls.cert'),certs.client.certChain)))
          config.set('mtls.ca',_.filter(_.concat(config.get('mtls.ca'),certs.caCert)))    
      } catch (e) {
          console.error(e)
      }
  }
}