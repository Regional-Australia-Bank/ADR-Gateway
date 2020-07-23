import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, SoftwareProductConnectivityConfig, AccessToken } from "../Types";
import { axios } from "../../../../Common/Axios/axios";

export const RegisterGetSSA = async (cert: ClientCertificateInjector, $: {
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  RegisterAccessCredentials: AccessToken,
}): Promise<string> => {
  let brandId = $.AdrConnectivityConfig.BrandId;
  let productId = $.SoftwareProductConfig.ProductId;
  let nextUrl = $.AdrConnectivityConfig.RegisterBaseUris.SecureResource + `/v1/banking/data-recipients/brands/${brandId}/software-products/${productId}/ssa`; // TODO move the page limitation to an integration test and config option

  let response = await axios.get(nextUrl, cert.inject({headers: {Authorization: `Bearer ${$.RegisterAccessCredentials.accessToken}`}}))

  return response.data;
}