import moment = require("moment")
const {Entropy,charset64} = require("entropy-string")
const entropy256bit = new Entropy({ charset: charset64, bits: 256 })
const entropy128bit = new Entropy({ charset: charset64, bits: 128 })
import {createHash} from "crypto"
import base64url from 'base64url';

import { JWT, JWK, JWS, JWE } from "jose"
import { ClientSpec, IssuerSpec } from "./TokenConfigProviders"
import { injectable, inject } from "tsyringe"
import { Consent } from "../../Entities/Consent"
import { ClientConfigProvider } from "./ClientConfigProviders"
import { oidc_fapi_hash } from "../../../../Common/SecurityProfile/Util"
import e = require("express")
import { OIDCConfiguration, testIssuer, DhServerConfig } from "../Config"
import { EcosystemMetadata } from "./EcosystemMetadata"

interface UserSpec {
    ppid: string
}

const generateNonce = () => {
    return entropy128bit.string();
}
@injectable()
class TokenIssuer {
    constructor(
        @inject("TokenIssuerConfig") private issuer:IssuerSpec,
        @inject("ClientConfigProvider") private clientConfigProvider:ClientConfigProvider,
        @inject("OIDCConfigurationPromiseFn") private oidcConfig: () => Promise<OIDCConfiguration>,
        @inject("EcosystemMetadata") private ecosystemMetadata:EcosystemMetadata,
    ) {}

    AuthCodeIDTokenPair = async (user:UserSpec, consent: Consent) => {

        let authTime = moment.utc().unix();
    
        let client = await this.clientConfigProvider.getConfig(consent.drAppClientId);

        // generate an AuthCode
        let code:string = entropy256bit.string();
    
        /**
         * OpenID spec 3.3.2.11. ID Token
         * nonce required
         * c_hash
         *  */ 
        let payload = {
            iss: testIssuer,
            sub: user.ppid, // TODO implement PairwiseAlg from openID connect - ensures PPID cannot be compared by two DR's for example.
            aud: client.audUri,
            exp: authTime + this.issuer.idTokenExp, // TODO clarify the CDR requirement for exp time (assuming 120 seconds)
            iat: authTime,
            auth_time: authTime,
            nonce: consent.nonce || generateNonce(),
            acr: "urn:cds.au:cdr:3", // TODO clarify levels and determine the appropriate response: https://consumerdatastandardsaustralia.github.io/standards/#levels-of-assurance-loas
            c_hash: oidc_fapi_hash(code),
            s_hash: consent.state && oidc_fapi_hash(consent.state),
            refresh_token_expires_at: consent.refreshTokenExpiresNumericDate(),
            sharing_expires_at: consent.SharingExpiresNumericDate()
        }
    
        const id_token = JWT.sign(payload,await this.issuer.signingKey())

        let drJwks = await (await this.ecosystemMetadata.getDataRecipient(consent.drAppClientId)).getJwks()
        let encKey = drJwks.get({'use':'enc',alg:'RSA-OAEP-256'}) // TODO take from client registartion crypto variables

        const encrypted_id_token = JWE.encrypt(id_token,encKey,{enc:'A256CBC-HS512',cty:'JWT',kid:encKey.kid}) // any of the algorithms here: https://tools.ietf.org/html/draft-ietf-jose-json-web-encryption-40
    
        return {
            code: code,
            id_token: encrypted_id_token
        }
    }
    
    TokenIDTokenPair = async (consent:Consent) => {
        const client = await this.clientConfigProvider.getConfig(consent.drAppClientId);
        const payload = await TokenIssuer.IDTokenPayload({
            consent:consent,
            oidcConfig: await this.oidcConfig(),
            issuerSpec:this.issuer,
            client:client
        });

        const id_token = JWT.sign(payload,await this.issuer.signingKey())

        let drJwks = await (await this.ecosystemMetadata.getDataRecipient(consent.drAppClientId)).getJwks()
        let encKey = drJwks.get({'use':'enc',alg:'RSA-OAEP-256'}) // TODO take from client registartion crypto variables

        const encrypted_id_token = JWE.encrypt(id_token,encKey,{enc:'A256CBC-HS512'}) // any of the algorithms here: https://tools.ietf.org/html/draft-ietf-jose-json-web-encryption-40
    
        return {
            access_token: consent.accessToken,
            refresh_token: consent.refreshToken,
            id_token: encrypted_id_token,
            expires_in: this.issuer.accessTokenExpirySeconds, // TODO clarify expires_in time ilmit
            scopes: consent.scopesArray().join(" ")
        }
    }

    static IDTokenPayload = async (params: {consent:Consent, oidcConfig:OIDCConfiguration, issuerSpec: IssuerSpec, client:ClientSpec}, includePIClaims:boolean = false) => {
        let nowTimestamp: number;

        nowTimestamp = moment.utc().unix();
    
        /**
         * OpenID spec 3.3.2.11. ID Token
         * nonce required
         * c_hash
         *  */ 
        let payload = {
            iss: testIssuer,
            sub: params.consent.subjectPpid, // TODO implement PairwiseAlg from openID connect - ensures PPID cannot be compared by two DR's for example.
            aud: params.client.audUri,
            exp: nowTimestamp + params.issuerSpec.idTokenExp, // TODO clarify the CDR requirement for exp time (assuming 120 seconds)
            iat: nowTimestamp,
            // TODO auth_time to be the time the user was authenticated.
            auth_time: moment(params.consent.consentConfirmedDate).subtract(10,'seconds').utc().unix(), 
            acr: "urn:cds.au:cdr:3", // TODO clarify levels and determine the appropriate response: https://consumerdatastandardsaustralia.github.io/standards/#levels-of-assurance-loas
            at_hash: oidc_fapi_hash(<string>params.consent.accessToken),
            refresh_token_expires_at: params.consent.refreshTokenExpiresNumericDate(),
            sharing_expires_at: params.consent.SharingExpiresNumericDate()
        }

        if (includePIClaims) {
            // TODO include Personal Information claims
        }
        
        return payload;
    }

    UserInfoIDToken = async (consent:Consent) => {
        const client = await this.clientConfigProvider.getConfig(consent.drAppClientId);
        const payload = await TokenIssuer.IDTokenPayload({
            consent:consent,
            oidcConfig: await this.oidcConfig(),
            issuerSpec:this.issuer,
            client:client
        },true);
        const id_token = JWT.sign(payload,await this.issuer.signingKey());
        return id_token;
    }
    
}

// TODO move this test data to a dependency


export {TokenIssuer}