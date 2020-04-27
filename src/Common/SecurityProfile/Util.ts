import { createHash } from "crypto";
import base64url from "base64url";
import fs from "fs"
import _ from "lodash"

const oidc_fapi_hash = (input: string):string => {
    // TODO implement auth_hash once algorithm of hash is known (SHA-256)
    const payload = input;
    const hasher = createHash('sha256');
    hasher.update(input,'ascii');
    const leftHalf = hasher.digest().slice(0,16)
    return base64url(leftHalf);
}

export const CertsFromFilesOrStrings = <T extends string|string[]>(s:T):(T extends string?Buffer:Buffer[]) => {
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

export {oidc_fapi_hash}