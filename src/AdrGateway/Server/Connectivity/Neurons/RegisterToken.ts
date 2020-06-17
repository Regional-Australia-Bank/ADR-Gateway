import { AdrConnectivityConfig } from "../../../Config";
import { injectable } from "tsyringe";
import { RegisterOidcResponse } from "./RegisterOidc";
import _ from "lodash";
import moment from "moment";
import uuid from "uuid";
import { JWKS, JWT } from "jose";
import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { SoftwareProductStatus } from "./SoftwareProductStatus";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { CreateAssertion } from "../Assertions";
import qs from "qs";
import { axios } from "../../../../Common/Axios/axios";


export const GetAccessToken = async (cert:ClientCertificateInjector, jwks: JWKS.KeyStore, token_endpoint:string, client_id: string): Promise<AccessToken> => {
    let options = {
        method: "POST",
        url: token_endpoint,
        responseType: "json",
        data: qs.stringify({
            grant_type: "client_credentials",
            client_assertion: CreateAssertion(client_id,token_endpoint,jwks),
            scope: "cdr-register:bank:read",
            client_id: client_id,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
        })
    }
    let response = await axios.request(cert.inject(<any>options));
    return new AccessToken(response.data.access_token,response.data.expires_in);
}

export class AccessToken {
    constructor (public accessToken:string, public expiresInSeconds: number) {}
}

@injectable()
export class RegisterTokenNeuron extends Neuron<[AdrConnectivityConfig,JWKS.KeyStore,RegisterOidcResponse,SoftwareProductStatus],AccessToken> {
    constructor(private cert:ClientCertificateInjector){super()}

    evaluator = ([e,j,r,s]:[AdrConnectivityConfig,JWKS.KeyStore,RegisterOidcResponse,SoftwareProductStatus]) => GetAccessToken(this.cert,j,r.token_endpoint,e.BrandId)

}