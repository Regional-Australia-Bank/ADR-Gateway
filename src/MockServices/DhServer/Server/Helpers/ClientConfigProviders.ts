import { JWK } from "jose";
import * as _ from "lodash"
import { config } from "winston";
import { EcosystemMetadata } from "./EcosystemMetadata";
import { inject, injectable } from "tsyringe";



interface ClientSpec {
    client_id: string
    audUri: string
    // sector_identifier_uri: string // https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
    encryptionKey: JWK.Key
}

abstract class ClientConfigProvider {
    abstract getConfig(client_id: string):Promise<ClientSpec>;
}

@injectable()
class EcosystemClientConfigProvider extends ClientConfigProvider {

    constructor(
        @inject("EcosystemMetadata") private ecosystemMetadata:EcosystemMetadata
    ) {
        super()
    }

    getConfig = async (client_id: string): Promise<ClientSpec> => {
        let m = await this.ecosystemMetadata.getDataRecipient(client_id);

        let client:ClientSpec = {
            audUri: m.audUri,
            client_id: m.clientId,
            encryptionKey: await m.getEncryptionKey(),
            // sector_identifier_uri: m.sector_identifier_uri
        }
        return client;
    }
}


export {EcosystemClientConfigProvider,ClientConfigProvider}