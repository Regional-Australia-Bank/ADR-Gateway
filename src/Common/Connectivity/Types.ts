import * as Config from "../Config"
import * as CommonTypes from "../Server/Types"
import { IsUrl } from "class-validator"
import { JWKS } from "jose";
import { ConsentRequestLog } from "../Entities/ConsentRequestLog";
import { DataHolderRegistration } from "../Entities/DataHolderRegistration";
import { ConsentRequestParams } from "./Evaluators/AuthorizationRequest";
import { IndexedSoftwareProductConfigs } from "./Evaluators/SoftwareProductConfig";

export type SoftwareProductConnectivityConfig = Config.SoftwareProductConnectivityConfig
export type AdrConnectivityConfig = Config.AdrConnectivityConfig
export type Dictionary<T> = CommonTypes.Dictionary<T>

export type EvalOpts = {ignoreCache?: "top" | "all"}
export type GetOpts<Output> = EvalOpts & {validator?: (output:Output) => boolean | Promise<boolean>}
export type DependencyEvaluator<Params,Output> = {
  Evaluate: ($?: EvalOpts) => Promise<Output>
  GetWithHealing: ($?: GetOpts<Output>) => Promise<Output>
}
export type DataHolderStatus = "OK" | "PARTIAL_FAILURE" | "UNAVAILABLE" | "SCHEDULED_OUTAGE"

type StringOrUndefined = string | undefined;

export {
  JWKS,
  ConsentRequestLog,
  DataHolderRegistration,
  ConsentRequestParams,
  IndexedSoftwareProductConfigs,
  StringOrUndefined
}

export interface DataholderRegistrationResponse {
  client_id: string,
  software_id: string,
  client_id_issued_at?: number,
  redirect_uris:string[]
  scope:string,
  id_token_encrypted_response_alg:string,
  id_token_encrypted_response_enc:string
}

export interface IdTokenValidationParts {
  nonce: string,
  c_hash: string,
  s_hash?: string,
  sharing_expires_at: number,
  refresh_token_expires_at: number
}

export class AccessToken {
  constructor (public accessToken:string, public expiresAt: Date) {}
}

export type UserInfoResponse = object & {refresh_token_expires_at:number,sharing_expires_at:number};

export interface TokenResponse {
  "access_token":string,
  "token_type":string,
  "expires_in":number
  "refresh_token"?:string
  "scope"?:string,
  "id_token":string
}

interface CodeParams {
  "grant_type":'authorization_code',
  "code": string
}

interface RefreshTokenParams {
  "grant_type":'refresh_token',
}

export type TokenGrantParams = CodeParams | RefreshTokenParams

export class RegisterOidcResponse {
  @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
  token_endpoint!: string;

  @IsUrl({require_tld:false})
  jwks_uri!: string;

  @IsUrl({require_tld:false})
  issuer!: string;

  constructor(data:any) {
      if (typeof data != 'object') throw 'Contructor input must be an object';
      this.issuer = data.issuer;
      this.jwks_uri = data.jwks_uri;
      this.token_endpoint = data.token_endpoint;
  }
}

export interface DataHolderRegisterMetadata {
  dataHolderBrandId: string,
  logoUri: string,
  brandName: string,
  industry: string,
  legalEntity: {
      legalEntityId: string,
      legalEntityName: string,
      registrationNumber: string,
      registrationDate: string,
      registeredCountry: string,
      abn: string,
      acn: string,
      arbn: string,
      industryCode: string,
      organisationType: string
  },
  status: string,
  endpointDetail: {
      version: string,
      publicBaseUri: string,
      resourceBaseUri: string,
      infosecBaseUri: string,
      extensionBaseUri: string,
      websiteUri: string
  },
  authDetails: [
      {
          registerUType: string,
          jwksEndpoint: string
      }
  ],
  lastUpdated: string
}

export class DataholderOidcResponse {
  @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
  token_endpoint: string;

  @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
  userinfo_endpoint: string;

  @IsUrl({require_tld:false}) 
  registration_endpoint: string;

  @IsUrl({require_tld:false})
  jwks_uri: string;

  @IsUrl({require_tld:false})
  authorization_endpoint: string;

  @IsUrl({require_tld:false})
  introspection_endpoint: string;

  @IsUrl({require_tld:false})
  revocation_endpoint: string;

  @IsUrl({require_tld:false})
  issuer: string;

  scopes_supported: string[]
  response_types_supported: string[]
  response_modes_supported: string[]
  grant_types_supported: string[]
  acr_values_supported: string[]
  subject_types_supported: string[]

  id_token_encryption_alg_values_supported?: string[]
  id_token_encryption_enc_values_supported?: string[]

  id_token_signing_alg_values_supported: string[]
  request_object_signing_alg_values_supported: string[]
  token_endpoint_auth_methods_supported: string[]
  mutual_tls_sender_constrained_access_tokens: any
  claims_supported: string

  constructor(data:any) {
      if (typeof data != 'object') throw 'Contructor input must be an object';
      this.issuer = data.issuer;
      this.jwks_uri = data.jwks_uri;
      this.token_endpoint = data.token_endpoint;
      this.userinfo_endpoint = data.userinfo_endpoint;
      this.authorization_endpoint = data.authorization_endpoint;
      this.registration_endpoint = data.registration_endpoint;
      this.introspection_endpoint = data.introspection_endpoint;
      this.revocation_endpoint = data.revocation_endpoint;

      this.scopes_supported = data.scopes_supported
      this.response_types_supported = data.response_types_supported
      this.response_modes_supported = data.response_modes_supported
      this.grant_types_supported = data.grant_types_supported
      this.acr_values_supported = data.acr_values_supported
      this.subject_types_supported = data.subject_types_supported

      this.id_token_signing_alg_values_supported = data.id_token_signing_alg_values_supported
      this.id_token_encryption_enc_values_supported = data.id_token_encryption_enc_values_supported
      this.id_token_encryption_alg_values_supported = data.id_token_encryption_alg_values_supported

      this.request_object_signing_alg_values_supported = data.request_object_signing_alg_values_supported
      this.token_endpoint_auth_methods_supported = data.token_endpoint_auth_methods_supported
      this.mutual_tls_sender_constrained_access_tokens = data.mutual_tls_sender_constrained_access_tokens
      this.claims_supported = data.claims_supported

  }
}
