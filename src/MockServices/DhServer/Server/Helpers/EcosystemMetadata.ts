import { Dictionary } from "tsyringe/dist/typings/types";
import { JWK, JWKS } from "jose";
import _ from "lodash"
import { injectable, inject } from "tsyringe";
import { ClientRegistrationManager } from "../../Entities/ClientRegistration";
import { axios } from "../../../../Common/Axios/axios";
import { DhServerConfig } from "../Config";
import { ClientCertificateInjector } from "../../../../Common/Services/ClientCertificateInjection";

interface EcosystemMetadata {
    getDataRecipient(clientId: string):Promise<DataRecipient>;
}

interface DataRecipient {
    clientId: string,
    jwks: string,
    redirectUris: string[],
    audUri: string,
    // sector_identifier_uri: string, To be supported in a future version of the standards
    getSignatureVerificationKey():Promise<JWK.Key>;
    getEncryptionKey():Promise<JWK.Key>;
    getJwks():Promise<JWKS.KeyStore>
}

@injectable()
class DefaultEcosystemMetadata implements EcosystemMetadata {

    constructor(
        private clientRegistrationManager: ClientRegistrationManager,
        @inject("ClientCertificateInjector") private mtls: ClientCertificateInjector,
    ) { }

  
    getDataRecipient = async (clientId: string):Promise<DataRecipient> => {
        let clientReg = await this.clientRegistrationManager.GetRegistration(clientId)

        if (typeof clientReg == 'undefined') {
            throw 'Data recipient could not be found'
        } else {
            return new DefaultDataRecipient({
                audUri: clientReg.clientId,
                clientId: clientReg.clientId,
                jwks: clientReg.jwks_uri,
                redirectUris: clientReg.redirectUris(),
            },this.mtls)
        }
    }

}

class DefaultDataRecipient implements DataRecipient {
    getJwks = async (): Promise<JWKS.KeyStore> => {
        let jwks = await (await axios.get(this.jwks,this.mtls.injectCa({responseType:"json"}))).data;
        return JWKS.asKeyStore(jwks);
    }
    getSignatureVerificationKey = async (): Promise<JWK.Key> => {
        return (await this.getJwks()).get({use:'sig'})
    }
    getEncryptionKey = async (): Promise<JWK.Key> => {
        return (await this.getJwks()).get({use:'enc'})
    }

    clientId: string;
    audUri: string;
    // sector_identifier_uri: string;
    jwks: string;
    redirectUris: string[];

    constructor(options: Pick<DataRecipient,'clientId'|'jwks'|'redirectUris'|'audUri'>, private mtls: ClientCertificateInjector) {
        this.clientId = options.clientId,
        this.jwks = options.jwks
        this.redirectUris = options.redirectUris
        this.audUri = options.audUri
        // this.sector_identifier_uri = options.sector_identifier_uri
    }
}


export {EcosystemMetadata,DefaultEcosystemMetadata}