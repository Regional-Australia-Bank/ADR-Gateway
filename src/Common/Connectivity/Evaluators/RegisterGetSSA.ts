import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, SoftwareProductConnectivityConfig, AccessToken } from "../Types";
import { axios } from "../../Axios/axios";

export const RegisterGetSSA = async (cert: ClientCertificateInjector, $: {
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  RegisterAccessCredentials: AccessToken,
}): Promise<string> => {
  let brandId = $.AdrConnectivityConfig.BrandId;
  let productId = $.SoftwareProductConfig.ProductId;
  let nextUrl = $.AdrConnectivityConfig.RegisterBaseUris.SecureResource + `/v1/banking/data-recipients/brands/${brandId}/software-products/${productId}/ssa`;

  const headers = <any>{
    Authorization: `Bearer ${$.RegisterAccessCredentials.accessToken}`
  }
  
  if ($.AdrConnectivityConfig.RegisterEndpointVersions?.GetSoftwareStatementAssertion) {
    headers["x-v"] = $.AdrConnectivityConfig.RegisterEndpointVersions.GetSoftwareStatementAssertion
  }

  let response = await axios.get(nextUrl, cert.inject({
    headers,
    softwareProductId: productId
  }))

  return response.data;
}