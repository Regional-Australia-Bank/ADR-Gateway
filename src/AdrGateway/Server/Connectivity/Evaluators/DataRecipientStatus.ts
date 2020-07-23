import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection"
import * as Types from "../Types"
import { axios } from "../../../../Common/Axios/axios"
import urljoin from "url-join"
import _ from "lodash"

export const AssertDataRecipientActive = async ($:{
  AdrConnectivityConfig: Types.AdrConnectivityConfig
  DataRecipientStatus: string
}) => {

  if ($.DataRecipientStatus !== "ACTIVE") {
    throw `Software product is not ACTIVE: ${$.AdrConnectivityConfig.BrandId} is ${$.DataRecipientStatus}`;
  }

}

export const DataRecipientStatus = async (cert:ClientCertificateInjector,$:{
  AdrConnectivityConfig: Types.AdrConnectivityConfig
}) => {

  const options = cert.injectCa({
    headers: {
      "x-v":1
    },
    responseType:"json"
  })

  const result = await axios.get(urljoin($.AdrConnectivityConfig.RegisterBaseUris.Resource,'/v1/banking/data-recipients/status'),options);
  const statusus:{
    dataRecipientId: string
    dataRecipientStatus: string
  }[] = result.data.dataRecipients;

  const thisProductStatus = _.filter(statusus, s => s.dataRecipientId == $.AdrConnectivityConfig.BrandId);
  if (thisProductStatus.length !== 1) {
    throw `Cannot uniquely identify status of software product ${$.AdrConnectivityConfig.BrandId}`;
  }
  const status = thisProductStatus[0];
  return status.dataRecipientStatus;

}