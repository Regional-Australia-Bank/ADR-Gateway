import { DataholderOidcResponse } from "./DataholderRegistration";
import { AxiosRequestConfig } from "axios";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { userInfo } from "os";
import { AccessToken } from "./RegisterToken";
import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { injectable } from "tsyringe";
import { ConsentRequestLog } from "../../../Entities/ConsentRequestLog";
import { axios } from "../../../../Common/Axios/axios";

type UserInfoResponse = object & {refresh_token_expires_at:number,sharing_expires_at:number};

const GetUserInfo = async (dhoidc:DataholderOidcResponse, accessToken: string, clientCertInjector:ClientCertificateInjector) => {

    let options:AxiosRequestConfig = {
        method:'POST',
        url: await dhoidc.userinfo_endpoint,
        headers: {Authorization: `Bearer ${accessToken}`},
        responseType:"json"
    }

    clientCertInjector.inject(options);
    let response:UserInfoResponse = (await axios.request(options)).data;
    return response
}

export interface AccessTokenHolder {
    accessToken:string
}

@injectable()
export class UserInfoNeuron extends Neuron<[DataholderOidcResponse,AccessTokenHolder],UserInfoResponse> {
    constructor(private cert:ClientCertificateInjector) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([dhoidc,consent]:[DataholderOidcResponse,AccessTokenHolder]) => {
        return await GetUserInfo(dhoidc,consent.accessToken,this.cert)
    }
}