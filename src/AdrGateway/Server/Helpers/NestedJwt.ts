import { Dataholder } from "../../Services/DataholderMetadata";
import { AdrGatewayConfig } from "../../Config";
import { JWE, JWK, JWT, JWKS } from "jose";
import moment = require("moment");
import { Neuron } from "../../../Common/Connectivity/Neuron";

const DecryptIdToken = (nestedToken:string, dataholder: Dataholder, decryptionKey: JWK.Key) => {
    try {
        return JWE.decrypt(nestedToken,decryptionKey).toString();
    } catch (err) {
        throw 'Decryption of the ID Token failed'
        // TODO better handle internal server error here
    }    
}

const decryptAndVerifyNestedJWT = async (nestedToken:string, dataholder: Dataholder, config: AdrGatewayConfig, decryptionKey: JWK.Key, signatureVerificationKeyStore: JWKS.KeyStore): Promise<{
    nonce: string,
    c_hash: string,
    sharing_expires_at: number,
    refresh_token_expires_at: number
}> => {
    
    const decryptedIdToken:string = DecryptIdToken(nestedToken,dataholder,decryptionKey);

    try {
        let verifiedIdToken = <{nonce:string, c_hash:string, refresh_token_expires_at:number, sharing_expires_at: number}>JWT.verify(decryptedIdToken,signatureVerificationKeyStore,{
            issuer: await dataholder.getIssuerIdentifier(), // OIDC 3.1.3.7. Point 2. must match known data holder issuer
            audience: await dataholder.getClientId(), // OIDC 3.1.3.7. Point 3,4,5 //TODO Unit test handling of multiple audiences
            algorithms: ["PS256","ES256"],
        });

        return verifiedIdToken;
    } catch (err) {
        throw err;
    }
}

export {decryptAndVerifyNestedJWT}