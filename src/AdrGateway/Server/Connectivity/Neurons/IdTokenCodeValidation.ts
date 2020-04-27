import { DataHolderRegistration } from "../../../Entities/DataHolderRegistration";
import { JWT, JWKS, JWE } from "jose";
import { DataholderOidcResponse } from "./DataholderRegistration";
import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { injectable } from "tsyringe";

// Node 12.9 is needed for RSA-OAEP-256 (see rsa.js in jose/lib/jwk/key/rsa.js)
const [major, minor] = process.version.substr(1).split('.').map(x => parseInt(x, 10))
const oaepHashSupported = major > 12 || (major === 12 && minor >= 9)
if (!oaepHashSupported) {
    throw("Node 12.9 or greater is needed")
}

const DecryptIdToken = (nestedToken:string, decryptionKey: JWKS.KeyStore) => {
    try {
        return JWE.decrypt(nestedToken,decryptionKey).toString();
    } catch (err) {
        throw 'Decryption of the ID Token failed'
    }    

}

export interface IdTokenValidationParts {
    nonce: string,
    c_hash: string,
    sharing_expires_at: number,
    refresh_token_expires_at: number
}

@injectable()
export class IdTokenCodeValidationNeuron extends Neuron<[JWKS.KeyStore,JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration],IdTokenValidationParts> {
    constructor(private idToken:string) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([drJwks,dhJwks,dhoidc,registration]:[JWKS.KeyStore,JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration]) => {
        let decryptedIdToken:string;
        decryptedIdToken = DecryptIdToken(this.idToken,drJwks); 

        // TODO log decrypted id token claims for regfresh-token retrieval

        let verifiedIdToken = <IdTokenValidationParts>JWT.verify(decryptedIdToken,dhJwks,{
            issuer: dhoidc.issuer, // OIDC 3.1.3.7. Point 2. must match known data holder issuer
            audience: registration.clientId, // OIDC 3.1.3.7. Point 3,4,5 //TODO Unit test handling of multiple audiences
            algorithms: ["PS256"], // TODO check inclusion of ES256 against standard
        });

        return verifiedIdToken;
    }
}
