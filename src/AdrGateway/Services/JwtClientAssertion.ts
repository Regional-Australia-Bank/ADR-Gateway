import { injectable, inject } from "tsyringe"
import { AdrGatewayConfig } from "../Config"
import { config } from "winston"
import { DataholderMetadata, DataholderOidcMetadata, Dataholder } from "./DataholderMetadata"
import uuid = require("uuid")
import moment = require("moment")
import { JWT, JWKS } from "jose"
import { OidcMetadataResolver } from "./OidcMetadataResolver"

@injectable()
class JwtClientAssertionGenerator {
    constructor(
        private privateKeystore: JWKS.KeyStore,
    ){}

    CreateAssertion = async (dh: Dataholder):Promise<string> => {
        let client_id = await dh.getClientId()
        let claims = {
            iss: client_id,
            sub: client_id,
            aud: await dh.getTokenEndpoint(),
            jti: uuid.v4(),
            exp: moment.utc().add(30,'s').unix(), // TODO configuration setting for JWT expiry
            iat: moment.utc().format()
        }

        let jwk = this.privateKeystore.get({use:'sig',alg:"PS256"});

        let assertion = JWT.sign(claims,jwk/*,{header:{typ:"JWT"}}*/);

        return assertion;
    }
    
}


export {JwtClientAssertionGenerator}