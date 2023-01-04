import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"
import * as Types from "../Types"
import { axios } from "../../Axios/axios"
import urljoin from "url-join"
import _ from "lodash"
import { GetRegisterAPIVersionConfig } from "../../../AdrGateway/Config";

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
  let config = GetRegisterAPIVersionConfig()
  const options = cert.injectCa({
    headers: {
      "x-v": config.DefaultAPIVersion.getSoftwareProductStatus
    },
    responseType:"json"
  })

  const result = await axios.get(urljoin($.AdrConnectivityConfig.RegisterBaseUris.Resource,'/v1/banking/data-recipients/brands/software-products/status'),options);
  // version 1 of this call uses softwareProductStatus as the spstatus
  // version 2 of this call uses status, as the spstatus
  // https://consumerdatastandardsaustralia.github.io/standards/#get-software-products-statuses

  let statusus = []
  switch(config.DefaultAPIVersion.getSoftwareProductStatus) {
    case 1:
      statusus = _.map(result.data.softwareProducts,(sp) => { return {"spid": sp.softwareProductId, "spstatus": sp.softwareProductStatus } })
      break;
    case 2:
      statusus = _.map(result.data.data,(sp) => { return {"spid": sp.softwareProductId, "spstatus": sp.status } })
      break;
    default: 
      throw `Unsupported version number of getSoftwareProductStatus ${config.DefaultAPIVersion.getSoftwareProductStatus}`;
      break;
  }
  
  const thisProductStatus = _.filter(statusus, s => s.spid == $.SoftwareProductConfig.ProductId);
  if (thisProductStatus.length !== 1) {
    throw `Cannot uniquely identify status of software product ${$.SoftwareProductConfig.ProductId}`;
  }
  const status = thisProductStatus[0];
  return status.spstatus;
}