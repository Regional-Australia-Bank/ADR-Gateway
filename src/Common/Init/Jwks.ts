import { JWKS, JWK, ECCurve, JSONWebKeySet } from "jose";
import fs from "fs";
import _ from "lodash"
import { axios } from "../Axios/axios";

const existingKeySets: { seed: any, jwks: JWKS.KeyStore }[] = [];

export const GenerateDrJwks = (seed?: any) => {
    let existingJwks = _.find(existingKeySets, (s) => s.seed === seed)?.jwks;
    if (existingJwks) return existingJwks;

    const encryptionAlgorithms = {
        'EC': ['ECDH-ES', 'ECDH-ES+A128KW', 'ECDH-ES+A192KW', 'ECDH-ES+A256KW'],
        'RSA': ['RSA-OAEP-256', 'RSA1_5', 'RSA-OAEP']
    }

    const ecCurves: ECCurve[] = ['P-256', 'P-384', 'P-521'];

    const keys: JWK.Key[] = []
    // add signing keys
    keys.push(JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' }));
    // EC is not supported for signing
    // keys.push(JWK.generateSync('EC', 'P-256', {alg: 'ES256', use: 'sig' }));
    // keys.push(JWK.generateSync('EC', 'P-384', {alg: 'ES384', use: 'sig' }));
    // keys.push(JWK.generateSync('EC', 'P-521', {alg: 'ES512', use: 'sig' }));        

    // add encryption keys
    for (let alg of encryptionAlgorithms.RSA) {
        keys.push(JWK.generateSync('RSA', 2048, { alg: alg, use: 'enc' }));
    }

    for (let alg of encryptionAlgorithms.EC) {
        for (let crv of ecCurves) {
            keys.push(JWK.generateSync('EC', crv, { alg: alg, use: 'enc' }));
        }
    }

    let jwks = new JWKS.KeyStore(keys);
    existingKeySets.push({ seed, jwks })
    return jwks;

}

export const GenerateDhJwks = (seed?: any) => {
    return new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })])
}

export const GenerateRegisterJwks = () => {
    return new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })])
}

export const GetJwks = async (config: { Jwks: string | JSONWebKeySet }): Promise<JWKS.KeyStore> => {
    let jwks = config.Jwks;
    let result: JWKS.KeyStore;
    if (typeof jwks == 'undefined') throw 'No Private JWKS configured';
    if (typeof jwks == 'string') {
        if (jwks.startsWith("http://") || jwks.startsWith("https://")) {
            return JWKS.asKeyStore((await axios.get(jwks, { responseType: "json" })).data);
        } else {
            try {
                result = JWKS.asKeyStore(JSON.parse(jwks))
            } catch (e) {
                // Not JSON, must be a file
                result = JWKS.asKeyStore(JSON.parse(fs.readFileSync(jwks, 'utf8')));
            }
            return result;
        }
    }
    else return JWKS.asKeyStore(jwks);
}
