import { JWKS, JWT, JWS } from "jose";
import { JtiLogManager } from "../Entities/JtiLog";
import {injectable,inject} from "tsyringe";
import { ClientJwksManager } from "../Entities/ClientJwks";
import { DefaultPathways } from "../../AdrGateway/Server/Connectivity/Pathways";
import { CompoundNeuron } from "../Connectivity/Neuron";

interface ClientJWTPayload {
    iss:string;
    sub:string;
    aud:string;
    jti?:string;
    exp?:string;
    iat?:string;
}

class DataHolderPathways {
    DataHolderJwks = (...args:any[]):CompoundNeuron<any,any> => {
        throw 'DataHolderPathways not implemented yet'
    }
}

@injectable()
class BearerJwtVerifier {

    constructor(
        private jtiLogManager:JtiLogManager,
    ) {}

    // TODO acceptableClientId can be removed
    verifyClientId = async (acceptableClientId: string|undefined, authHeaderValue:string|undefined, audienceBaseUri:string, GetJwks:(assumedClientId:string) => CompoundNeuron<void,JWKS.KeyStore>):Promise<string> => {
    
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
        let jwks = await GetJwks(assumedClientId).GetWithHealing((jwks) => {
            JWS.verify(bearerTokenJwt,jwks);
            return true;
        });

        verified = JWT.verify(bearerTokenJwt,jwks,{
            complete: true,
            audience: audienceBaseUri,
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