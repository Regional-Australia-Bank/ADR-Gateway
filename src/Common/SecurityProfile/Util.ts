import { createHash } from "crypto";
import base64url from "base64url";
import fs from "fs"
import _ from "lodash"
import LRU from 'lru-cache'
import { Entropy, charset64 } from "entropy-string"
import { lib, SHA256, enc } from "crypto-js";


const entropy256bit = new Entropy({ charset: charset64, bits: 256 })

const lruOptions = { ttl: 1000 * 60 * 10 } // 10 mins
const cache = new LRU(lruOptions)


export const getAuthState = async(id) => {
    return cache.get('' + id)
}

export const setAuthState = async (id, code_verifier, code_challenge) => {
    const data = {
        code_verifier,
        code_challenge
    }
    cache.set('' + id, _.cloneDeep(data))
}

export const generateCodeVerifier = () : string => {
    return new Entropy({ charset: charset64, bits: 256 }).string();
}

export const sha256CodeVerifier = (code_verifier: string) : string => {
    // return base64url(createHash('sha256').update(code_verifier, 'ascii').digest('base64'));
    return SHA256(code_verifier).toString(enc.Base64url)
}


const oidc_fapi_hash = (input: string): string => {
    // TODO implement auth_hash once algorithm of hash is known (SHA-256)
    const payload = input;
    const hasher = createHash('sha256');
    hasher.update(input, 'ascii');
    const leftHalf = hasher.digest().slice(0, 16)
    return base64url(leftHalf);
}

export const CertsFromFilesOrStrings = <T extends string | string[]>(s: T): (T extends string ? Buffer : Buffer[]) => {
    if (typeof s === 'undefined') return undefined;
    let a: string[];
    if (!Array.isArray(s)) {
        a = [<any>s]
    } else {
        a = s
    }
    return <any>_.map(a, b => {
        if (b.startsWith("file:")) {
            let filename = b.substr(5);
            return fs.readFileSync(filename)
        } else {
            return Buffer.from(b)
        }
    })
}

export { oidc_fapi_hash }