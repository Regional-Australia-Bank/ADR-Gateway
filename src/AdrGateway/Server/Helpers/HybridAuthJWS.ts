import { JWKS, JWT, JWK } from "jose";
import _ from "lodash"
import { Dictionary } from "../../../Common/Server/Types";
import { URL } from "url";

interface BaseJwt {
    iss: string;
    sub: string;
    aud: string;
    exp: Date
    jti: string;
    iat: Date
}

interface AuthSignatureRequest {
    adrSigningJwk: JWK.Key,
    clientId: string,
    existingArrangementId?: string,
    callbackUrl: string,
    scopes: string[],
    additionalClaims?: {
      userinfo?: Dictionary<any>,
      id_token?: Dictionary<any>,
    }
    authorizeEndpointUrl: string,
    sharingDuration: number
    nonce: string
    state: string
    issuer: string
}

const getAuthPostGetRequestUrl = (req: AuthSignatureRequest) => {

    let url = new URL(req.authorizeEndpointUrl);

    if (url.protocol != 'https:') throw 'Cannot create an authorization request for a non-https endpoint.'

    let queryParams = {
        response_type: "code id_token",
        client_id: req.clientId,
        redirect_uri: req.callbackUrl,
        scope:  req.scopes.join(" "),
        nonce: req.nonce,
        state: req.state,
    }

    for (let [k,v] of Object.entries(queryParams)) {
        url.searchParams.append(k,v);
    }

    const acrSpec = { // TODO abstract out as a parameter to POST /cdr/consents
      "essential": true,
      "values": ["urn:cds.au:cdr:2"]
    }

    let claimsPart = {
        "claims": {
          "sharing_duration": req.sharingDuration, 
          "userinfo": {
            "acr": acrSpec,
            "refresh_token_expires_at": {"essential": true},
            "cdr_arrangement_id": {"essential": true}
          },
          "id_token": {
            "acr": acrSpec,
            "refresh_token_expires_at": {"essential": true},
            "cdr_arrangement_id": {"essential": true}
          }
        }
      };

    // merge in once-off additional claims
    _.merge(claimsPart.claims.userinfo,req.additionalClaims?.userinfo)
    _.merge(claimsPart.claims.id_token,req.additionalClaims?.id_token)

    // add the existing arrangement ID if supplied
    if (req.existingArrangementId) {
      (<any>claimsPart).cdr_arrangement_id = req.existingArrangementId
    }

    let payload = _.merge(queryParams,claimsPart);

    const signingOptions = {
      algorithm: 'PS256',
      audience: req.issuer,
      expiresIn: '1 hour',
      header: {
          typ: 'JWT'
      },
      issuer: req.clientId
    }
    
    const signature = JWT.sign(
      payload,
      req.adrSigningJwk,
      signingOptions
    )

    url.searchParams.append('request',signature);

    return url.toString();

}

export {getAuthPostGetRequestUrl}