import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, SoftwareProductConnectivityConfig, JWKS, DataholderOidcResponse, DataHolderRegisterMetadata, AccessToken } from "../Types";
import moment from "moment";
import uuid from "uuid";
import { JWT } from "jose";
import { axios } from "../../Axios/axios";
import _ from "lodash"
import { DataHolderRegistrationManager, DataHolderRegistration } from "../../Entities/DataHolderRegistration";
import { AxiosResponse, AxiosRequestConfig } from "axios";
import qs from "qs";
import { CreateAssertion } from "../../Connectivity/Assertions";

export interface DataholderRegistrationResponse {
  client_id: string,
  software_id: string,
  recipient_base_uri: string,
  client_id_issued_at?: number,
  redirect_uris:string[]
  scope:string,
  id_token_encrypted_response_alg:string,
  id_token_encrypted_response_enc:string
}


export const GetDataHolderRegistrationAccessToken = async (cert:ClientCertificateInjector, $:{
  DataRecipientJwks: JWKS.KeyStore,
  DataHolderOidc: DataholderOidcResponse,
  BootstrapClientRegistration: DataHolderRegistration
}): Promise<AccessToken> => {
  let options:AxiosRequestConfig = {
      method: "POST",
      url: $.DataHolderOidc.token_endpoint,
      responseType: "json",
      data: qs.stringify({
          grant_type: "client_credentials",
          client_assertion: CreateAssertion($.BootstrapClientRegistration.clientId,$.DataHolderOidc.token_endpoint,$.DataRecipientJwks),
          scope: "cdr:registration",
          client_id: $.BootstrapClientRegistration.clientId,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
      })
  }
  let response = await axios.request(cert.inject(options));
  return new AccessToken(response.data.access_token,response.data.expires_in);
}

export const DhRegistrationMatchesExpectation = (registration:DataholderRegistrationResponse,$:{
  AdrConnectivityConfig:AdrConnectivityConfig,
  SoftwareProductConfig:SoftwareProductConnectivityConfig,
  SoftwareStatementAssertion:string
}):boolean => {
  // check if configured vs registered redirect_uris are different
  let rUrlDifferenceLeft = _.difference($.SoftwareProductConfig.redirect_uris, registration.redirect_uris)
  let rUrlDifferenceRight = _.difference(registration.redirect_uris,$.SoftwareProductConfig.redirect_uris)
  if (rUrlDifferenceLeft.length > 0 || rUrlDifferenceRight.length > 0) return false;

  if ($.AdrConnectivityConfig.Crypto?.PreferredAlgorithms) {
      let matchedPreferredAlgorithms = false;
      for (let pair of $.AdrConnectivityConfig.Crypto?.PreferredAlgorithms) {
          if (pair.id_token_encrypted_response_alg == registration.id_token_encrypted_response_alg && pair.id_token_encrypted_response_enc == registration.id_token_encrypted_response_enc) {
              matchedPreferredAlgorithms = true;
              break;
          }
      }
      if (!matchedPreferredAlgorithms) return false;
  }

  let ssaParts:{
      org_name?: string,
      scope?: string,
      client_name?: string
      client_description?: string
      client_uri?: string
      redirect_uris?: string
      logo_uri?: string
      tos_uri?: string
      policy_uri?: string
      jwks_uri?: string
      revocation_uri?: string
      recipient_base_uri?:string
  } = JWT.decode($.SoftwareStatementAssertion)

  const stringPropertieKeys = ['org_name','client_name','client_description','client_uri','logo_uri','tos_uri','policy_uri','jwks_uri','revocation_uri','recipient_base_uri']

  // Check that data holders have the most recent metadata from the register about us

  for (let key of stringPropertieKeys) {
      if (registration[key] !== ssaParts[key]) {
          return false;
      }
  }

  let scopeGap = _.difference(ssaParts.scope.split(" "), registration.scope.split(" "));
  if (scopeGap.length > 0) return false;

  return true;
}

const AgreeCrypto = (config:AdrConnectivityConfig,dhOidc:DataholderOidcResponse) => {

  if (config.Crypto?.PreferredAlgorithms?.length) {
      // Some ordered list of preferred algorithms is provided, so make a choice accordingly
      for (let pair of config.Crypto?.PreferredAlgorithms) {
          if (dhOidc.id_token_encryption_alg_values_supported && (typeof _.find(dhOidc.id_token_encryption_alg_values_supported,alg => alg == pair.id_token_encrypted_response_alg) == 'undefined')) {
              continue
          }
          if (dhOidc.id_token_encryption_enc_values_supported && (typeof _.find(dhOidc.id_token_encryption_enc_values_supported,enc => enc == pair.id_token_encrypted_response_enc) == 'undefined')) {
              continue
          }
          return pair;
      }
  }

  // No list of preferences or no preference match, so choice the first values from the data holder, or our own choice
  return {
      id_token_encrypted_response_alg: (dhOidc.id_token_encryption_alg_values_supported && dhOidc.id_token_encryption_alg_values_supported[0]) || "RSA-OAEP-256",
      id_token_encrypted_response_enc: (dhOidc.id_token_encryption_enc_values_supported && dhOidc.id_token_encryption_enc_values_supported[0]) || "A256CBC-HS512"
  }
  
}

const RegistrationRequestObject = ($:{
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataHolderOidc: DataholderOidcResponse,
  SoftwareStatementAssertion: string,
}) => {

  let crypto = AgreeCrypto($.AdrConnectivityConfig,$.DataHolderOidc);

  let o = {
      "iss": $.SoftwareProductConfig.ProductId,
      "iat": moment().utc().unix(),
      "exp": moment().add(30,'s').utc().unix(), //TODO configurable
      "jti": uuid.v4(),
      "aud": $.DataHolderOidc.issuer, // As specified https://github.com/cdr-register/register/issues/58
      //"redirect_uris":["http://www.invaliduri.com/callback"],
      "redirect_uris":$.SoftwareProductConfig.redirect_uris, // TODO reinstate
      "token_endpoint_auth_signing_alg":"PS256",
      "token_endpoint_auth_method":"private_key_jwt",
      "grant_types":[
         "client_credentials",
         "authorization_code",
         "refresh_token",
         //"urn:ietf:params:oauth:grant-type:jwt-bearer" // As specified (https://github.com/cdr-register/register/issues/54)
      ],
      "response_types":["code id_token"],
      "application_type":"web",
      "id_token_signed_response_alg":$.AdrConnectivityConfig.Crypto?.IDTokenSignedResponseAlg || "PS256",
      "id_token_encrypted_response_alg":crypto.id_token_encrypted_response_alg,
      "id_token_encrypted_response_enc":crypto.id_token_encrypted_response_enc,
      "request_object_signing_alg":"PS256",
      "software_statement":$.SoftwareStatementAssertion
    }

  o.grant_types.push("urn:ietf:params:oauth:grant-type:jwt-bearer") // TODO remove after release 1.1.1 https://github.com/cdr-register/register/issues/54#issuecomment-597368382

  return o;

}

const NewRegistrationAtDataholder = async (cert:ClientCertificateInjector, $: {
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataRecipientJwks: JWKS.KeyStore,
  DataHolderOidc: DataholderOidcResponse,
  SoftwareStatementAssertion: string
}):Promise<DataholderRegistrationResponse> => {
  let registrationRequest = RegistrationRequestObject($)
  let registrationRequestJwt = JWT.sign(registrationRequest,$.DataRecipientJwks.get({alg:'PS256',use:'sig'}),{header:{typ:"JWT"}})

  let options = cert.inject({method:"POST", url: $.DataHolderOidc.registration_endpoint, responseType: "json", data: registrationRequestJwt, headers: {"content-type":"application/jwt"}});
  let responseRaw = await axios.request(options)
  let response:DataholderRegistrationResponse = responseRaw.data;

  return response;
}

export const NewClientRegistration = async (cert:ClientCertificateInjector, registrationManager:DataHolderRegistrationManager, $: {
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataRecipientJwks: JWKS.KeyStore,
  DataHolderOidc: DataholderOidcResponse,
  DataHolderBrandMetadata: DataHolderRegisterMetadata,
  SoftwareStatementAssertion: string
}) => {
 
  let response = await NewRegistrationAtDataholder(cert,$)
  let registration = await registrationManager.NewRegistration(response,$.DataHolderBrandMetadata.dataHolderBrandId)
  return registration;

}

export const CurrentRegistrationAtDataholder = async (cert:ClientCertificateInjector,$:{
  DataHolderOidc: DataholderOidcResponse,
  BootstrapClientRegistration: DataHolderRegistration,
  DhRegAccessToken: AccessToken
}):Promise<DataholderRegistrationResponse> => {

  let response:AxiosResponse<DataholderRegistrationResponse> = await axios.get($.DataHolderOidc.registration_endpoint+'/'+$.BootstrapClientRegistration.clientId,cert.inject({
      responseType: "json",
      headers: {Authorization: `Bearer ${$.DhRegAccessToken.accessToken}`}
  }))
  return response.data;
}

export const UpdateRegistrationAtDataholder = async (cert:ClientCertificateInjector, $:{
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataRecipientJwks: JWKS.KeyStore,
  DataHolderOidc: DataholderOidcResponse,
  SoftwareStatementAssertion: string,
  BootstrapClientRegistration: DataHolderRegistration,
  DhRegAccessToken: AccessToken
}):Promise<DataholderRegistrationResponse> => {
  let registrationRequest = RegistrationRequestObject($)
  let registrationRequestJwt = JWT.sign(registrationRequest,$.DataRecipientJwks.get({alg:'PS256',use:'sig'}))

  let response = await axios.request(cert.inject({
      method:"PUT",
      url:$.DataHolderOidc.registration_endpoint+'/'+$.BootstrapClientRegistration.clientId,
      data:registrationRequestJwt,
      responseType: "json",
      headers: {"content-type":"application/jwt", Authorization: `Bearer ${$.DhRegAccessToken.accessToken}`}
  }))

  return response.data;
}

export const CheckAndUpdateClientRegistration = async (cert:ClientCertificateInjector,registrationManager:DataHolderRegistrationManager,$:{
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataRecipientJwks: JWKS.KeyStore,
  DataHolderOidc: DataholderOidcResponse,
  SoftwareStatementAssertion: string,
  BootstrapClientRegistration: DataHolderRegistration,
  DhRegAccessToken: AccessToken
}) => {
  let registration = await CurrentRegistrationAtDataholder(cert,$)

  let registrationPacket: DataHolderRegistration
  if (!DhRegistrationMatchesExpectation(registration,$)) {
      let response = await UpdateRegistrationAtDataholder(cert,$);
      registrationPacket = await registrationManager.UpdateRegistration(response,$.BootstrapClientRegistration.dataholderBrandId)
      return registrationPacket;
  } else {
      return $.BootstrapClientRegistration;
  }
}