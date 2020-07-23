import { RegisterOidcResponse, AdrConnectivityConfig } from "../Types";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { axios } from "../../../../Common/Axios/axios";

export const GetRegisterOIDC = async (cert:ClientCertificateInjector,$:{AdrConnectivityConfig:AdrConnectivityConfig}):Promise<RegisterOidcResponse> => {
  let url = $.AdrConnectivityConfig.RegisterBaseUris.Oidc + "/.well-known/openid-configuration";

  let oidcData = new Promise((resolve,reject) => {
      axios.get(url, cert.injectCa({responseType: "json", timeout: 10000})).then(res => { // TODO configure timeout value
          resolve(res.data)
      },err => {
          reject(err)
      })
  })

  return new RegisterOidcResponse(await oidcData);
}