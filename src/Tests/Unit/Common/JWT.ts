import { JWKS, JWT } from "jose";

const GetSignedJWT = (payload:any, jwks: JWKS.KeyStore, options:object = {}):string => {

    let key = jwks.get({use:"sig"});
    let token = JWT.sign(payload,key,options);

    return token;
}

export {GetSignedJWT}