import * as Types from "../Types"
import { axios } from "../../Axios/axios";
import { AxiosResponse } from "axios";
import _ from "lodash"

export type IndexedSoftwareProductConfigs = {
  byKey: Types.Dictionary<Types.SoftwareProductConnectivityConfig>
  byId: Types.Dictionary<Types.SoftwareProductConnectivityConfig>
  byIndex: Types.Dictionary<Types.SoftwareProductConnectivityConfig>
}

export const GetSoftwareProductConfigs = (async ({AdrConnectivityConfig}:{AdrConnectivityConfig: Types.AdrConnectivityConfig}):Promise<IndexedSoftwareProductConfigs> => {

  let promises:Types.Dictionary<Promise<AxiosResponse<Types.SoftwareProductConnectivityConfig>|{data:{error:string}}>> = {}

  for (let [key,uri] of Object.entries(AdrConnectivityConfig.SoftwareProductConfigUris)) {
      promises[key] = (axios.get(uri,{responseType:"json",timeout: 10000})).catch(() => ({data:{"error":`Timed out attepting to fetch ${uri}`}}))
  }
  
  let values = _.map(await Promise.all(Object.values(promises)), v => v.data);

  let byKey:Types.Dictionary<Types.SoftwareProductConnectivityConfig> = {}
  let byId:Types.Dictionary<Types.SoftwareProductConnectivityConfig> = {}
  let byIndex:Types.Dictionary<Types.SoftwareProductConnectivityConfig> = {}

  let index = 0;
  for (let [k,promise] of Object.entries(promises)) {
    let value = <Partial<Types.SoftwareProductConnectivityConfig>><any>(await promise).data;
    byIndex[index] = <any>value;
    byKey[k] = <any>value;
    if (value.ProductId) {
      byId[value.ProductId] = <any>value;
    }
    index++;
  }

  return {byKey,byId,byIndex};
});

export const GetSoftwareProductConfig = async ($:{SoftwareProductConfigs: IndexedSoftwareProductConfigs, SoftwareProductId:string}):Promise<Types.SoftwareProductConnectivityConfig> => {
  if (typeof $.SoftwareProductId == "string") {
    return $.SoftwareProductConfigs.byId[$.SoftwareProductId]
  } else {
    throw 'Must supply a SoftwareProductId as a parameter'
  }
};
