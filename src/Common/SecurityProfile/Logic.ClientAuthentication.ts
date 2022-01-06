import { JWKS, JWT, JWS } from "jose";
import { JtiLogManager } from "../Entities/JtiLog";
import { injectable} from "tsyringe";
import { GetOpts } from "../../Common/Connectivity/Types";
import { JoseBindingConfig } from "../Server/Config";

interface ClientJWTPayload {
    iss:string;
    sub:string;
    aud:string;
    jti?:string;
    exp?:string;
    iat?:string;
}


@injectable()
class BearerJwtVerifier {

    constructor(
        private jtiLogManager:JtiLogManager
    ) {}

    // TODO acceptableClientId can be removed
    verifyClientId = async (
        acceptableClientId: string|undefined,
        authHeaderValue:string|undefined,
        requestedUri:string,
        recipientBaseUri:string,
        GetJwks: (assumedClientId:string) => {
            GetWithHealing: ($?: GetOpts<any>) => Promise<JWKS.KeyStore>
        }
    ):Promise<string> => {
        if (typeof authHeaderValue == 'undefined') throw new Error("Authorization header is not present");
    
        if (!authHeaderValue.startsWith("Bearer ")) throw new Error("Bearer token expected but not supplied");
    
        let bearerTokenJwt:string = authHeaderValue.substr("Bearer ".length);
    
        let payload = <ClientJWTPayload> JWT.decode(bearerTokenJwt);
        let assumedClientId = payload?.sub
        if (typeof assumedClientId !== 'string') throw new Error("JWT sub claim is not a string");

        if (typeof acceptableClientId === 'string') {
            if (assumedClientId !== acceptableClientId) {
                throw 'clientId from sub claim does not match the acceptable'
            }
        }


        let verified = <JWT.completeResult|undefined>undefined;
        // get the key the verifies the signature
        let jwks = await GetJwks(assumedClientId).GetWithHealing({
            validator:(jwks) => {
                JWS.verify(bearerTokenJwt,jwks);
                return true;
            }
        });

        verified = JWT.verify(bearerTokenJwt,jwks,{
            complete: true,
            audience: [requestedUri, recipientBaseUri],
            issuer: assumedClientId,
            subject: assumedClientId,
            algorithms: ["PS256","ES256"]
        });

        // further checks aside from jose processing
        if (typeof verified == 'undefined') throw 'Verified JWT payload expected, but is undefined'
    
        if ((payload.jti || '') == '') throw new Error("jti mandatory but not supplied");

        if ((payload.exp || '') == '') throw new Error("exp mandatory but not supplied");

        if (!(await this.jtiLogManager.IsJtiUnique(payload.jti,payload.iss,payload.sub)))  {
            throw new Error("The given jti has already been used. Jti must be unique")
        }
    
        return payload.sub;
    }

    static async Middleware() {

    }
}

export {BearerJwtVerifier}