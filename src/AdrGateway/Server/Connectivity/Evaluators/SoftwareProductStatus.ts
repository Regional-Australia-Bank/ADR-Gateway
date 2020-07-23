import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection"
import * as Types from "../Types"
import { axios } from "../../../../Common/Axios/axios"
import urljoin from "url-join"
import _ from "lodash"

export const AssertSoftwareProductActive = async ($:{
  SoftwareProductStatus: string,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig
}) => {

  if ($.SoftwareProductStatus !== "ACTIVE") {
    throw `Software product is not ACTIVE: ${$.SoftwareProductConfig.ProductId} is ${$.SoftwareProductStatus}`;
  }

}

export const SoftwareProductStatus = async (cert:ClientCertificateInjector,$:{
  AdrConnectivityConfig: Types.AdrConnectivityConfig,
  SoftwareProductConfig: Types.SoftwareProductConnectivityConfig
}) => {

  const options = cert.injectCa({
    headers: {
      "x-v":1
    },
    responseType:"json"
  })

  const result = await axios.get(urljoin($.AdrConnectivityConfig.RegisterBaseUris.Resource,'/v1/banking/data-recipients/brands/software-products/status'),options);
  const statusus:{
    softwareProductId: string
    softwareProductStatus: string
  }[] = result.data.softwareProducts;

  const thisProductStatus = _.filter(statusus, s => s.softwareProductId == $.SoftwareProductConfig.ProductId);
  if (thisProductStatus.length !== 1) {
    throw `Cannot uniquely identify status of software product ${$.SoftwareProductConfig.ProductId}`;
  }
  const status = thisProductStatus[0];
  return status.softwareProductStatus;
}