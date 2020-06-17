import { axios } from "../../../../Common/Axios/axios"
import { DhServerConfig } from "../Config"
import _ from "lodash"
import { DefaultClientCertificateInjector } from "../../../../AdrGateway/Services/ClientCertificateInjection";

export const GetRegisterJWKS = async (configFn: () => Promise<DhServerConfig>,mtls:DefaultClientCertificateInjector):Promise<object> => {
    let config = await configFn();
    
    return (await axios.get(config.RegisterJwksUri,mtls.injectCa({responseType:"json"}))).data
}