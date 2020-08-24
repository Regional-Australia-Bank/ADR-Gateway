import { JWKS } from "jose";

const JWKSSerial = {
    Serialize: (jwks:JWKS.KeyStore) => JSON.stringify(jwks.toJWKS(true)),
    Deserialize: (s:string) => JWKS.asKeyStore(JSON.parse(s))
}

export {JWKSSerial as JWKS}