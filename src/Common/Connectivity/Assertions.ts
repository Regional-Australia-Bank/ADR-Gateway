import { JWKS, JWT } from "jose";
import uuid = require("uuid");
import moment = require("moment");

export const CreateAssertion = (client_id:string,endpoint:string,keystore:JWKS.KeyStore) => {
    let claims = {
        iss: client_id,
        sub: client_id,
        aud: endpoint,
        jti: uuid.v4(),
        exp: moment.utc().add(30,'s').unix(), // TODO configuration setting for JWT expiry
        iat: moment.utc().format()
    }
  
    let jwk = keystore.get({use:'sig',alg:"PS256"});

    let assertion = JWT.sign(claims,jwk);
    return assertion;
}

export const CreateCDRArrangementJWTAssertion = (cdr_arrangement_id: string, keystore:JWKS.KeyStore) => {
    let claims = {
        cdr_arrangement_id: cdr_arrangement_id
    }
    let jwk = keystore.get({use:'sig',alg:"PS256"});

    let assertion = JWT.sign(claims,jwk);
    return assertion;
}