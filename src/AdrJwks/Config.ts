import convict = require("convict");
import { GenerateDrJwks } from "../Common/Init/Jwks";
import { JSONWebKeySet } from "jose";
import { ConvictFormats } from "../Common/Server/Config";

export type AdrJwksConfig = {
    Port: number,
    Jwks: JSONWebKeySet
}

export const GetConfig = ():AdrJwksConfig => {

    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8402,
            env: 'ADR_JWKS_SERVICE_PORT'
        },
        Jwks: {
            doc: 'The private JWKS to use as a basis for signing, verifying and decryption',
            format: ConvictFormats.Jwks.name,
            default: GenerateDrJwks().toJWKS(true),
            env: 'ADR_JWKS_SERVICE_JWKS'
        },
    })
    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});
    return config.get();
}