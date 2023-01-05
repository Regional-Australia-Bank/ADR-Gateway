import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { AdrConnectivityConfig, SoftwareProductConnectivityConfig, AccessToken } from "../Types";
import { axios } from "../../Axios/axios";
import { GetRegisterAPIVersionConfig } from "../../../AdrGateway/Config";

export const RegisterGetSSA = async (cert: ClientCertificateInjector, $: {
  AdrConnectivityConfig: AdrConnectivityConfig,
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  RegisterAccessCredentials: AccessToken,
}): Promise<string> => {
  let brandId = $.AdrConnectivityConfig.BrandId;
  let productId = $.SoftwareProductConfig.ProductId;
  let nextUrl = $.AdrConnectivityConfig.RegisterBaseUris.SecureResource + `/v1/banking/data-recipients/brands/${brandId}/software-products/${productId}/ssa`;

  let config = GetRegisterAPIVersionConfig()

  const headers = <any>{
    Authorization: `Bearer ${$.RegisterAccessCredentials.accessToken}`
  }
  
  if ($.AdrConnectivityConfig.RegisterEndpointVersions?.GetSoftwareStatementAssertion) {
    headers["x-v"] = $.AdrConnectivityConfig.RegisterEndpointVersions.GetSoftwareStatementAssertion
  } else {
    headers["x-v"] = config.DefaultAPIVersion.getSoftwareStatementAssertion
  }

  let response = await axios.get(nextUrl, cert.inject({
    headers,
  },productId))

  return response.data;
}