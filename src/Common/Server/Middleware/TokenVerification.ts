import { JSONWebKeySet, JWT, JWKS } from "jose"
import express from "express";
import { IncomingMessage } from "http";
import _ from "lodash"

export const ExtractBearerToken = (req:IncomingMessage) => {
    try {
        let auth = req.headers['authorization'];
        if (typeof auth == 'undefined') throw 'auth header is not provided';
        const regex = /^Bearer (.+)$/;
        let matches = regex.exec(auth)
        if (typeof matches == 'undefined' || matches == null) throw 'Bearer token not provided'
        let match = matches[1]
        return match;
    } catch (err) {
        throw 'Bearer token not provided'
    }
}

const OAuthScope = (jwksFn:() => Promise<JWKS.KeyStore>, config:() => Promise<{issuer:string}>, realm:string, scope: string, aud?:string|(() => string|Promise<string>)) => {
    const middleware = async (req:IncomingMessage,res:express.Response,next:any) => {
        let jwt:string;
        try {
            jwt = ExtractBearerToken(req);
        } catch (err) {
            return res.status(400).header('WWW-Authenticate',`Bearer realm="${realm}", error="invalid_request"`).json({error:"Bearer token not supplied"})
        }
        let jwks = await jwksFn();
        let payload:{scope:string, aud:string, sub:string};
        try {
            payload = <any>JWT.verify(jwt,jwks,{
                issuer: (await config()).issuer
            })
        } catch (err) {
            return res.status(401).header('WWW-Authenticate',`Bearer realm="${realm}", error="invalid_token"`).json({error:"Bearer JWT is invalid"})
        }
        try {
            let token_scopes = payload.scope.split(" ")
            let hasScope = _.filter(token_scopes, s => s == scope).length > 0
            if (!hasScope) throw 'Scope invalid'
        } catch (err) {
            return res.status(401).header('WWW-Authenticate',`Bearer realm="${realm}", error="insufficient_scope"`).json({error:"Bearer JWT does not have expected scope"})
        }
        try {
            if (typeof aud != 'undefined') {
                let expectedAud:string;
                if (typeof aud == 'function') {
                    expectedAud = await Promise.resolve(aud())
                } else {
                    expectedAud = aud
                }

                if (expectedAud != payload.aud) throw `Audience ${payload.aud} does not match expected ${expectedAud}`
            }
        } catch (err) {
            return res.status(401).header('WWW-Authenticate',`Bearer realm="${realm}", error="invalid_token"`).json({error:"Bearer JWT does not have expected audience"})
        }

        (<any>req).token_subject = payload.sub

        next()
    }
    return middleware
}

export const ScopeMiddleware = (jwks:() => Promise<JWKS.KeyStore>, oidcConfig: () => Promise<{issuer:string}>) => OAuthScope.bind(undefined,jwks,oidcConfig);