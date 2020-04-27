import { JWKS, JWK } from "jose"
import uuid = require("uuid")
import moment = require("moment")
import { singleton } from "tsyringe"
import { Dictionary } from '../../Common/Server/Types';
import { Connection } from "typeorm";
import { ClientJwksManager } from "../../Common/Entities/ClientJwks";
import { container } from "../../AdrServer/AdrDiContainer";
import { ConsentRequestLogManager } from "../../AdrGateway/Entities/ConsentRequestLog";
import { loggers } from "winston";

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
        userId:string
    }[] = [
        {refreshToken: "refresh-token-1" ,accessToken: "access-token-1",client:"client1",userId:"user1"},
        {refreshToken: "refresh-token-2" ,accessToken: "access-token-2",client:"client2",userId:"user2"},
        {refreshToken: "refresh-token-3" ,accessToken: "access-token-3",client:"client1",userId:"user3"}
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
        // if (this.alreadyInit) {return;} // Ensure that init is only run once (otherwise we have issues with duplicate test data entries)
        this.alreadyInit = true;

        const connection = await container.resolve<Promise<Connection>>("Promise<Connection>");

        // generate cdr-register jwks
        const jwksManager = container.resolve(ClientJwksManager);    

        let connectionsIdentical = (await jwksManager.connection == connection);

        // give the verifier access to the public keys
        try {
            for (let [clientId, jwks] of Object.entries(this.clients)) {
                let json = JSON.stringify(jwks.toJWKS(false)); // false => public key only
              await jwksManager.InsertJwksJson(clientId, json);
            }    
        } catch (err) {
            console.error(err);
            throw(err);
        }
        // insert some tokens
        const consentManager = container.resolve(ConsentRequestLogManager);
        try {
            for (let c of this.consents) {
                let consent = await consentManager.LogAuthRequest({
                    adrSystemId: 'test-system-id',
                    adrSystemUserId: c.userId,
                    dataHolderId: c.client,
                    nonce: 'nonce',
                    redirectUri: 'redrect_uri',
                    requestedSharingDuration: 60,
                    scopes: [],
                    state: 'state'
                });
    
                consent.refreshToken = c.refreshToken
                consent.accessToken = c.accessToken
                consent.consentedDate = moment.utc().toDate()
                consent.refreshTokenExpiry = moment.utc().add(2,'days').toDate()
                consent.accessTokenExpiry = moment.utc().add(2,'minutes').toDate()
                consent.sharingEndDate = moment.utc().add(2,'months').toDate()
                consent.ValidateAsCurrent(); // ensure the test data is valid as current
    
                await consent.save();
    
            }
        } catch(err) {
            console.log(err)
        }
    }
}
export{ConformingDataProvider}

function ConformingData() {
    return container.resolve(ConformingDataProvider)
}

export {ConformingData}