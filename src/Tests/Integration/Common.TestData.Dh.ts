import { JWKS, JWK } from "jose"
import uuid = require("uuid")
import moment = require("moment")
import { singleton } from "tsyringe"
import { Dictionary } from '../../Common/Server/Types';
import { container } from '../../MockServices/DhServer/DhDiContainer';
import { Connection } from "typeorm";
import { ClientJwksManager } from "../../Common/Entities/ClientJwks";
import { ConsentManager } from "../../MockServices/DhServer/Entities/Consent";
import { CdsScope } from "../../Common/SecurityProfile/Scope";

interface TestClientRequestJWTPayload {
    aud?: string
    iss?: string
    sub?: string
    jti?: string
    exp?: number
    iat?: number
    nbf?: number
}

@singleton()
class ConformingDataProvider {
    private alreadyInit: boolean = false;

    public clients: Dictionary<JWKS.KeyStore> = {
        "client1": new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })]),
        "client2": new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })]),
        "cdr-register": new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })])
    }

    public consents:{
        refreshToken: string,
        accessToken: string,
        client:string,
        scopes: CdsScope[],
        subjectId: string
    }[] = [
        {refreshToken: "refresh-token-1" ,accessToken: "access-token-1",client:"client1",scopes: [],subjectId: "john"},
        {refreshToken: "refresh-token-2" ,accessToken: "access-token-2",client:"client2",scopes: [CdsScope.BankAccountsBasicRead],subjectId: "john"},
        {refreshToken: "refresh-token-3" ,accessToken: "access-token-3",client:"client1",scopes: [],subjectId: "john"}
    ]

    jwks(clientId:string = "cdr-register"): JWKS.KeyStore {
        return this.clients[clientId]
    }
    payload(clientId:string = "cdr-register",audience:string = "http://localhost:3000/revoke"): TestClientRequestJWTPayload {
        return {
            aud: audience,
            iss: clientId,
            sub: clientId,
            jti: uuid.v4(),
            exp: moment.utc().unix() + 30
        }
    }
    async init() {
        if (this.alreadyInit) {return;} // Ensure that init is only run once (otherwise we have issues with duplicate test data entries)
        this.alreadyInit = true;

        const connection = await container.resolve<Promise<Connection>>("Promise<Connection>");

        // generate cdr-register jwks
        const jwksManager = container.resolve(ClientJwksManager);
      
        // give the verifier access to the public keys
        for (let [clientId, jwks] of Object.entries(this.clients)) {
            let json = JSON.stringify(jwks.toJWKS(false)); // false => public key only
          await jwksManager.InsertJwksJson(clientId, json);
        }

        // insert some tokens
        const consentManager = container.resolve(ConsentManager);
        for (let c of this.consents) {
            await consentManager.newTestConsent(c.refreshToken, c.accessToken, c.subjectId, c.client,c.scopes);
        }
    }
}
export{ConformingDataProvider,ConformingData}

function ConformingData() {
    return container.resolve(ConformingDataProvider)
}