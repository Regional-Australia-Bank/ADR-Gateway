import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, RegisterOidcResponse, AccessToken } from "../Types";
import { JWKS } from "jose";
import qs from "qs";
import { CreateAssertion } from "../Assertions";
import { axios } from "../../../../Common/Axios/axios";
import * as Types from "../Types"

type RegisterTokenParams = {
  connectivityConfig: AdrConnectivityConfig,
  dataRecipientJwks: JWKS.KeyStore,
  registerOidcResponse: RegisterOidcResponse,
  client_id: string
}

export const GetRegisterAccessToken = async (cert:ClientCertificateInjector, params: {AdrConnectivityConfig: Types.AdrConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, RegisterOidc: Types.RegisterOidcResponse}): Promise<AccessToken> => {
  let client_id = params.AdrConnectivityConfig.BrandId;
  let options = {
      method: "POST",
      url: params.RegisterOidc.token_endpoint,
      responseType: "json",
      data: qs.stringify({
          grant_type: "client_credentials",
          client_assertion: CreateAssertion(client_id,params.RegisterOidc.token_endpoint,params.DataRecipientJwks),
          scope: "cdr-register:bank:read",
          client_id: client_id,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
      })
  }
  let response = await axios.request(cert.inject(<any>options));
  return new AccessToken(response.data.access_token,response.data.expires_in);
}