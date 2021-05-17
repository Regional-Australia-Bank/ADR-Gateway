import { AxiosRequestConfig } from "axios";
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection";
import { axios } from "../../Axios/axios";
import * as Types from "../Types"

export const GetUserInfo = async (clientCertInjector:ClientCertificateInjector, $:{
    DataHolderOidc: Types.DataholderOidcResponse,
    ConsentCurrentAccessToken?: Types.ConsentRequestLog
    AccessToken?:string
} & ({
    ConsentCurrentAccessToken: Types.ConsentRequestLog
} | {
    AccessToken:string
})) => {

    let options:AxiosRequestConfig = {
        method:'POST',
        url: await $.DataHolderOidc.userinfo_endpoint,
        headers: {Authorization: `Bearer ${$.AccessToken || $.ConsentCurrentAccessToken.accessToken}`},
        responseType:"json"
    }

    options = clientCertInjector.inject({
        ...options,
        softwareProductId: $.ConsentCurrentAccessToken.softwareProductId
    });

    let response = (await axios.request(options)).data;

    return <Types.UserInfoResponse>response
}