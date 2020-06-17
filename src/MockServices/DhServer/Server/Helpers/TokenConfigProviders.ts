import { JWK, JWKS } from "jose";
import { inject, injectable } from "tsyringe";


interface IssuerSpec {
    signingKey: () => Promise<JWK.Key>,
    accessTokenExpirySeconds: number
    idTokenExp: number
    authTokenExpirySeconds: number,
    refreshTokenExpiryDays: number
}

interface ClientSpec {
    audUri: string
    // sector_identifier_uri: string // https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
    encryptionKey: JWK.Key
}

@injectable()
class DefaultIssuer implements IssuerSpec {
    accessTokenExpirySeconds = 300
    idTokenExp = 120
    authTokenExpirySeconds = 120
    refreshTokenExpiryDays = 28
    signingKey:() => Promise<JWK.Key>
    constructor(
        @inject("PrivateKeystore") keystore: () => Promise<JWKS.KeyStore>
    ) {
        this.signingKey = async () => {
            return (await keystore()).get({use:'sig'})
        };
    }
}

export {IssuerSpec,ClientSpec,DefaultIssuer}