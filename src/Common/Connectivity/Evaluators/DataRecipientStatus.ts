import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"
import * as Types from "../Types"
import { axios } from "../../Axios/axios"
import urljoin from "url-join"
import _ from "lodash"

export const AssertDataRecipientActive = async ($:{
  AdrConnectivityConfig: Types.AdrConnectivityConfig
  DataRecipientStatus: string
}) => {

  if ($.DataRecipientStatus !== "ACTIVE") {
    throw `Data recipient entity is not ACTIVE: ${$.AdrConnectivityConfig.LegalEntityId} is ${$.DataRecipientStatus}`;
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

  const thisDataRecipientStatus = _.filter(statusus, s => s.dataRecipientId == $.AdrConnectivityConfig.LegalEntityId);
  if (thisDataRecipientStatus.length !== 1) {
    throw `Cannot uniquely identify status of data recipient ${$.AdrConnectivityConfig.LegalEntityId}`;
  }
  const status = thisDataRecipientStatus[0];
  return status.dataRecipientStatus;

}