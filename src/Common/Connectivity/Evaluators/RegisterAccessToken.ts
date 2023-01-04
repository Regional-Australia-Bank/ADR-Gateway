import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, RegisterOidcResponse, AccessToken } from "../Types";
import { JWKS } from "jose";
import qs from "qs";
import { CreateAssertion } from "../../Connectivity/Assertions";
import { axios } from "../../Axios/axios";
import * as Types from "../Types"

type RegisterTokenParams = {
  connectivityConfig: AdrConnectivityConfig,
  dataRecipientJwks: JWKS.KeyStore,
  registerOidcResponse: RegisterOidcResponse,
  client_id: string
}

export const GetRegisterAccessToken = async (cert:ClientCertificateInjector, params: {
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  DataRecipientJwks: Types.JWKS.KeyStore
  RegisterOidc: Types.RegisterOidcResponse
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig
}): Promise<AccessToken> => {
  const client_id = params.SoftwareProductConfig.ProductId;
  const options = {
      method: <"POST">"POST",
      url: params.RegisterOidc.token_endpoint,
      responseType: <"json">"json",
      data: qs.stringify({
          grant_type: "client_credentials",
          client_assertion: CreateAssertion(client_id,params.RegisterOidc.token_endpoint,params.DataRecipientJwks),
          scope: params.AdrConnectivityConfig.RegisterBaseScope,
          client_id: client_id,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
      }),
      softwareProductId:client_id
  }

  const response = await axios.request(cert.inject(options,client_id));

  return new AccessToken(response.data.access_token,response.data.expires_in);
}

export const GetRegisterAccessTokenDHB = async (cert:ClientCertificateInjector, params: {
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  DataRecipientJwks: Types.JWKS.KeyStore
  RegisterOidc: Types.RegisterOidcResponse
  SoftwareProductConfigs: Types.IndexedSoftwareProductConfigs
}): Promise<AccessToken> => {
  const client_id = params.SoftwareProductConfigs.byIndex[0].ProductId; //Should be software product ID, not brand ID  //Using default [0] to suffice until Dr G has a product ID in context
  const options = {
    method: <"POST">"POST",
    url: params.RegisterOidc.token_endpoint,
    responseType: <"json">"json",
    data: qs.stringify({
      grant_type: "client_credentials",
      client_assertion: CreateAssertion(client_id,params.RegisterOidc.token_endpoint,params.DataRecipientJwks),
      scope: params.AdrConnectivityConfig.RegisterBaseScope,
      client_id: client_id,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
    }),
    softwareProductId:client_id
  }

  const response = await axios.request(cert.inject(options,client_id));

  return new AccessToken(response.data.access_token,response.data.expires_in);
}