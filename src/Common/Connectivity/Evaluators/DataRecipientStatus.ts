import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"
import * as Types from "../Types"
import { axios } from "../../Axios/axios"
import urljoin from "url-join"
import _ from "lodash"
import { GetRegisterAPIVersionConfig } from "../../../AdrGateway/Config";

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
  let config = GetRegisterAPIVersionConfig()
  const options = cert.injectCa({
    headers: {
      "x-v": config.DefaultAPIVersion.getDataRecipientStatus
    },
    responseType:"json"
  })

  const result = await axios.get(urljoin($.AdrConnectivityConfig.RegisterBaseUris.Resource,'/v1/banking/data-recipients/status'),options);
  // version 1 of this call uses dataRecipientId as the drid
  // version 2 of this call uses legalEntityId as the drid
  // https://consumerdatastandardsaustralia.github.io/standards/#get-data-recipients-statuses
  let statusus = []
  switch(config.DefaultAPIVersion.getDataRecipientStatus) {
    case 1:
      statusus = _.map(result.data.dataRecipients,(dr) => { return {"drid": dr.dataRecipientId, "drstatus": dr.dataRecipientStatus } })
      break;
    case 2:
      statusus = _.map(result.data.data,(dr) => { return {"drid": dr.legalEntityId, "drstatus": dr.status } })
      break;
    default: 
      throw `Unsupported version number of getDataRecipientStatus ${config.DefaultAPIVersion.getDataRecipientStatus}`;
      break;
  }

    const thisDataRecipientStatus = _.filter(statusus, s => s.drid == $.AdrConnectivityConfig.LegalEntityId);
    if (thisDataRecipientStatus.length !== 1) {
      throw `Cannot uniquely identify status of data recipient ${$.AdrConnectivityConfig.LegalEntityId}`;
    }
    const status = thisDataRecipientStatus[0];
    return status.drstatus;

}