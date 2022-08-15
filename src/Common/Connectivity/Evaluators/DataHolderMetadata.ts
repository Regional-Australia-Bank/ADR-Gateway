import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { axios } from "../../Axios/axios";
import _ from "lodash";
import { AccessToken, AdrConnectivityConfig, DataHolderRegisterMetadata } from "../Types";
import { NoneFoundError } from "../Errors";
import urljoin from "url-join";
import * as Types from "../Types"

const GetDataHoldersResponse = async (accessToken:string, nextUrl:string, cert:ClientCertificateInjector):Promise<DataHolderRegisterMetadata[]> => {
  let response = await axios.get(nextUrl,cert.inject({responseType:"json", headers:{Authorization: `Bearer ${accessToken}`}}))
  let responseObject = response.data;
  if (typeof responseObject.meta != 'object' || typeof responseObject.links != 'object') {
      throw 'Response from register for GetDataHolders is not conformant'
  }
  let dataholders:object[] = responseObject.data;
  if (typeof responseObject.links.next == 'string') {
      let nextDataHolders = await GetDataHoldersResponse(accessToken,responseObject.links.next,cert);
      return <any>_.concat(dataholders,nextDataHolders);
  } else {
      return <any>dataholders;
  }
}


export const GetDataholders = async (cert: ClientCertificateInjector, $:{AdrConnectivityConfig:AdrConnectivityConfig, RegisterAccessCredentialsDHB:AccessToken}): Promise<DataHolderRegisterMetadata[]> => {
  let nextUrl = $.AdrConnectivityConfig.RegisterBaseUris.SecureResource + '/v1/banking/data-holders/brands?page-size=100'; // TODO move the page limitation to an integration test and config option

  let dataholders = await GetDataHoldersResponse($.RegisterAccessCredentialsDHB.accessToken,nextUrl,cert);

  // filter out non-ACTIVE dhs
  dataholders = _.filter(dataholders, d => d.status.toUpperCase() == "ACTIVE")

  return dataholders;
}

export const GetDataholderMetadata = async ($:{
    DataHolderBrands:DataHolderRegisterMetadata[],
    DataHolderBrandId:string
}) => {
    let dataholderMeta = _.filter($.DataHolderBrands, dh => dh.dataHolderBrandId == $.DataHolderBrandId);
    if (dataholderMeta.length != 1) throw new NoneFoundError(`GetDataHolderBrandMetadata: Expected exactly one matching dataholder for dataHolderBrandId=${$.DataHolderBrandId} but found ${dataholderMeta.length}`);
    return dataholderMeta[0];
}

export const AssertDataHolderActiveAtRegister = async ($:{
    DataHolderBrandMetadata:DataHolderRegisterMetadata,
    DataHolderBrandId:string
}) => {
    if ($.DataHolderBrandMetadata.status !== "ACTIVE") {
        throw new Error(`Data holder ${$.DataHolderBrandMetadata.brandName} is not active - ${$.DataHolderBrandMetadata.dataHolderBrandId}`)
    }
}

export const DataHolderStatus = async (cert: ClientCertificateInjector, $:{
    DataHolderBrandMetadata:DataHolderRegisterMetadata,
    AdrConnectivityConfig:Types.AdrConnectivityConfig,
    IgnoreDHStatus: boolean
}) => {

    console.log("Data holder status is ignore or not", $.IgnoreDHStatus)

    if (!$.AdrConnectivityConfig.CheckDataholderStatusEndpoint || $.IgnoreDHStatus) {
        return "OK"
    }

    let options = cert.injectCa({
        responseType:"json",
        headers: {
            "accept":"application/json",
            "x-v":1,
        }
    });
    let url = urljoin($.DataHolderBrandMetadata.endpointDetail.publicBaseUri,'cds-au/v1/discovery/status')
    
    try {
        let response = await axios.get(url,options)
        let responseObject: {
            data: {
                status: Types.DataHolderStatus
            }
        } = response.data;
        console.log("Data holder status response -->", response.data)
        if (responseObject && responseObject.data && responseObject.data.status) {
            return responseObject.data.status
        } else {
            throw 'Data holder status could not be retrieved from status endpoint.'
        }
    } catch (err) {
        throw err;
    }
}

export const AssertDataHolderIsUp = async ($:{
    DataHolderStatus:string,
    DataHolderBrandMetadata:DataHolderRegisterMetadata,
}) => {

    if ($.DataHolderStatus === "OK") {
        return;
    }

    throw new Error(`Dataholder is is not OK but ${$.DataHolderStatus}: ${$.DataHolderBrandMetadata.dataHolderBrandId} - ${$.DataHolderBrandMetadata.brandName}`) 

}