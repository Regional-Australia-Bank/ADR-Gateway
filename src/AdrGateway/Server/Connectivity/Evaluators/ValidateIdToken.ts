import * as Types from "../Types"
import { JWE, JWT } from "jose"
import { HttpCodeError } from "../../../../Common/Server/ErrorHandling"
import { oidc_fapi_hash } from "../../../../Common/SecurityProfile/Util"

// Node 12.9 is needed for RSA-OAEP-256 (see rsa.js in jose/lib/jwk/key/rsa.js)
const [major, minor] = process.version.substr(1).split('.').map(x => parseInt(x, 10))
const oaepHashSupported = major > 12 || (major === 12 && minor >= 9)
if (!oaepHashSupported) {
  throw("Node 12.9 or greater is needed")
}

const DecryptIdToken = (nestedToken:string, decryptionKey: Types.JWKS.KeyStore) => {
  try {
    return JWE.decrypt(nestedToken,decryptionKey).toString();
  } catch (err) {
    throw 'Decryption of the ID Token failed'
  }    
}

export const ValidateIdToken = (IdToken: string,$:{
  DataRecipientJwks: Types.JWKS.KeyStore,
  DataHolderJwks: Types.JWKS.KeyStore,
  DataHolderOidc: Types.DataholderOidcResponse,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {
  let decryptedIdToken:string;
  decryptedIdToken = DecryptIdToken(IdToken,$.DataRecipientJwks); 

  // TODO log decrypted id token claims for regfresh-token retrieval

  let verifiedIdToken = <Types.IdTokenValidationParts>JWT.verify(decryptedIdToken,$.DataHolderJwks,{
      issuer: $.DataHolderOidc.issuer, // OIDC 3.1.3.7. Point 2. must match known data holder issuer
      audience: $.CheckAndUpdateClientRegistration.clientId, // OIDC 3.1.3.7. Point 3,4,5 //TODO Unit test handling of multiple audiences
      algorithms: ["PS256"], // TODO check inclusion of ES256 against standard
  });

  return verifiedIdToken;
}

export const ValidateAuthorizeResponse = async ($:{
  Consent: Types.ConsentRequestLog,
  AuthCode: string,
  IdToken: string,
  State: string,
  DataHolderOidc: Types.DataholderOidcResponse,
  DataHolderJwks: Types.JWKS.KeyStore,
  DataRecipientJwks: Types.JWKS.KeyStore,
  CheckAndUpdateClientRegistration: Types.DataHolderRegistration
}) => {
  // Do validation checks from here: https://openid.net/specs/openid-connect-core-1_0.html#HybridAuthResponse

  // 1. Verify that the response conforms to Section 5 of [OAuth.Responses].
  // 1.1. has code and id_token (already checked)
  // 1.2. is fragment encoded (already assumed)

  // 2.1 Follow validation rules RFC6749 4.1.2 - code and state are required, or error and optionally error_description and error_uri

  // 2.2 Follow validation rules RFC6749 10.12 - to be implemented at redirection URI endpoint.

  // X.1: We have to decrypt the token and do a basic signature verification before further verifications

  // TODO check that this self heals in the case when an expired Dataholder JWKS is cached. Very low priority.
  let verifiedIdToken: ReturnType<typeof ValidateIdToken>
  try {
      verifiedIdToken = ValidateIdToken($.IdToken, $)
  } catch (e) {
      throw new HttpCodeError("Could not verify id token",400,{
          code: "invalid_id_token",
          detail: e
      })
  }

  // 3. Follow the ID Token validation rules in Section 3.3.2.12 when the response_type value used is code id_token or code id_token token.
  // 3.2.2.11 The value of the nonce Claim MUST be checked to verify that it is the same value as the one that was sent in the Authentication Request. The Client SHOULD check the nonce value for replay attacks. The precise method for detecting replay attacks is Client specific.

  if (!$.Consent.nonce) {
      // If we did not supply a nonce, take the nonce value from the data holder
      $.Consent.nonce = verifiedIdToken.nonce
      $.Consent = await $.Consent.save()
  } else {
      if (verifiedIdToken.nonce != $.Consent.nonce) throw new HttpCodeError('Nonces do not match',400,{
        code: "nonce_mismatch",
        detail: "nonces do not match"
    });
  }

  //  The Client SHOULD check the nonce value for replay attacks
  if (typeof $.Consent.idTokenJson == 'string') throw 'Potential replay attack. Nonce has already been used to activate this token.'
  
  
  // 3.2.1 https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
  // TODO check acr and auth_time claims if they exist

  // 4. Access Token validation N/A

  // 5. Follow the Authorization Code validation rules in Section 3.3.2.10 when the response_type value used is code id_token or code id_token token.
  // 5.1 c_hash validation
  let acHashValid:boolean = verifiedIdToken.c_hash == oidc_fapi_hash($.AuthCode)
  if (!acHashValid) throw new HttpCodeError('Hash of auth_code is not valid',400,{
    code: "c_hash_mismatch",
    detail: "auth_code hash does not match"
  });;

  let stateHashValid:boolean = verifiedIdToken.s_hash == oidc_fapi_hash($.State)
  if (!stateHashValid) throw new HttpCodeError('State hash does not match',400,{
    code: "s_hash_mismatch",
    detail: "state hash does not match"
  });

  // TODO Must/should also log the response

  // Fetch an initial token and output to check scopes
}