import { DataholderOidcMetadata } from "./DataholderMetadata";
import { ClientCertificateInjector } from "./ClientCertificateInjection";
import { injectable, inject } from "tsyringe";
import { axios } from "../../Common/Axios/axios";

interface OIDCResponse {
    authorization_endpoint: string
    token_endpoint: string
    jwks_uri: string
    issuer: string
    userinfo_endpoint: string
}

@injectable()
class OidcMetadataResolver {
    constructor(
        @inject("ClientCertificateInjector") private clientCertificateInjector:ClientCertificateInjector
    ) {}

    getEndpoints = async (dataholder:DataholderOidcMetadata): Promise<OIDCResponse> => {
        let options = this.clientCertificateInjector.inject({method:"GET",url:dataholder.oidcEndpoint,responseType:"json"});
        return await (await axios.request(options)).data;
    }

    getIssuerIdentifier = async (dataholder:DataholderOidcMetadata) => {
        return (await this.getEndpoints(dataholder)).issuer;
    }

    getAuthEndpoint = async (dataholder:DataholderOidcMetadata) => {
        return (await this.getEndpoints(dataholder)).authorization_endpoint;
    }

    getTokenEndpoint = async (dataholder:DataholderOidcMetadata) => {
        return (await this.getEndpoints(dataholder)).token_endpoint;
    }
    getUserInfoEndpoint = async (dataholder:DataholderOidcMetadata) => {
        return (await this.getEndpoints(dataholder)).userinfo_endpoint;
    }
    getJwksEndpoint = async (dataholder:DataholderOidcMetadata) => {
        return (await this.getEndpoints(dataholder)).jwks_uri;
    }

}

export {OidcMetadataResolver}