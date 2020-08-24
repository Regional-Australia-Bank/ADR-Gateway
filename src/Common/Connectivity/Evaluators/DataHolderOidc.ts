import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { DataHolderRegisterMetadata, DataholderOidcResponse } from "../Types";
import { axios } from "../../Axios/axios";

export const GetDataHolderOidc = (async (cert:ClientCertificateInjector, _:{DataHolderBrandMetadata:DataHolderRegisterMetadata}) => {
    let url = _.DataHolderBrandMetadata.endpointDetail.infosecBaseUri + "/.well-known/openid-configuration";
   
    let oidcData = new Promise((resolve,reject) => {
        axios.get(url, cert.injectCa({responseType:"json", timeout: 10000})).then(value => { // TODO configure timeout value
            resolve(value.data)
        },err => {
            reject(err)
        })
    })

    return new DataholderOidcResponse(await oidcData);
})