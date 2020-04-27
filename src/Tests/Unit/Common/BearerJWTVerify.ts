import { assert } from 'chai';

import { JWKS, JWT, JWK } from 'jose';
import { BearerJwtVerifier } from '../../../Common/SecurityProfile/Logic.ClientAuthentication';
import { GetSignedJWT } from '../../Unit/Common/JWT';

import * as moment from 'moment'
import base64url from 'base64url';
import _ from "lodash"
import uuid from 'uuid';


export const Tests = (() => {
    
  let verifier:BearerJwtVerifier;

  let jtiLogManager = {
    cache:<[string,string,string][]>[],
    IsJtiUnique:(jti:string,iss:string,sub:string) => {
      let existing = _.find(jtiLogManager.cache,(([j,i,s]:[string,string,string]) => {
        return (j == jti && i == iss && s == sub)
      }))

      if (typeof existing == 'undefined') {
        jtiLogManager.cache.push([jti,iss,sub]);
        return true;
      } else {
        return false;
      }
    }
  }

  let jwks = {
    "client1": new JWKS.KeyStore([
      JWK.generateSync('RSA',2048, { use: 'sig', alg: 'PS256'})]
    ),
    "client2": new JWKS.KeyStore([
      JWK.generateSync('RSA',2048, { use: 'sig', alg: 'PS256'})]
    ),
    "client3": new JWKS.KeyStore([
      JWK.generateSync('RSA',2048, { use: 'sig', alg: 'RS256'})] // Has RS256 which is not allowed
    ),
    "cdr-register": new JWKS.KeyStore([
      JWK.generateSync('RSA',2048, { use: 'sig', alg: 'PS256'})]
    )
  }


  let pw = {
    DataHolderJwks: (clientId: "client1" | "client2" | "cdr-register") => {
      return {
        GetWithHealing: async (validator: ((o: JWKS.KeyStore) => Promise<boolean>)) => {
          await validator(jwks[clientId])
          return jwks[clientId]
        }
      }
    }
  }

  verifier = new BearerJwtVerifier(<any>jtiLogManager)


  async function BearerJwtVerify(audience: string, assumedClientId:string|undefined, authHeaderValue:string|undefined) {
    await verifier.verifyClientId(audience,assumedClientId,authHeaderValue, async (clientId:string) => {
      return await (<any>pw.DataHolderJwks(<any>clientId).GetWithHealing(() =>Promise.resolve(true)))
    })
  }

  const ConformingData = () => {
    return {
      payload: (clientId:string = "cdr-register",audience:string = "http://localhost:3000/revoke"):{iss:string,aud:string,exp:number,sub:string,iat?:number,nbf?:number,jti:string} => {
        return {
            aud: audience,
            iss: clientId,
            sub: clientId,
            jti: uuid.v4(),
            exp: moment.utc().unix() + 30
        }
      },
      jwks: (clientId?:"client1"|"client2"|"cdr-register") => jwks[clientId||"cdr-register"]
    }
  }

  describe('BearerJwtVerify', async () => {

    before(async () => {
      // RegisterTestDependencies();
      // await ConformingData().init();
      // verifier = container.resolve(BearerJwtVerifier);
    })
    
    after(async () => {
      // let connection = await <Promise<Connection>>container.resolve("Promise<Connection>")
      // await connection.close();
      // container.reset();
    })

    it('Works given conforming request', () => {
      const authHeaderValue = "Bearer " + GetSignedJWT(ConformingData().payload(), ConformingData().jwks());

      return assert.isFulfilled(BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue))
    });

    it('Denies audience not matching request', () => {

      const authHeaderValue = "Bearer " + GetSignedJWT(ConformingData().payload(), ConformingData().jwks());

      return BearerJwtVerify("http://localhost:3000/some-other-audience", "cdr-register", authHeaderValue).should.be.rejectedWith('unexpected "aud" claim value');

    });

    it('Requires iss AND sub are equal to the supplied clientId (and therefore sub iss == sub)', () => {

      const payloadWrongIss = ConformingData().payload();
      payloadWrongIss.iss = "wrong-iss"

      const payloadWrongSub = ConformingData().payload();
      payloadWrongSub.sub = "wrong-sub"

      return Promise.all(
        [
          BearerJwtVerify(
            <string>payloadWrongIss.aud,
            "cdr-register",
            "Bearer " + GetSignedJWT(payloadWrongIss, ConformingData().jwks())
          ).should.be.rejectedWith('unexpected "iss" claim value'),
          BearerJwtVerify(
            <string>payloadWrongSub.aud,
            "cdr-register",
            "Bearer " + GetSignedJWT(payloadWrongSub, ConformingData().jwks())
          ).should.be.rejectedWith('unexpected "sub" claim value')
        ]
      )

    });

    it('Does not allow the same jti to be used twice', async () => {
      const authHeaderValue = "Bearer " + GetSignedJWT(ConformingData().payload(), ConformingData().jwks());

      let firstUsePromise = BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue);
      await firstUsePromise;
      let secondUsePromise = BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue);

      return Promise.all([
        firstUsePromise.should.be.fulfilled,
        secondUsePromise.should.be.rejectedWith('The given jti has already been used. Jti must be unique')
      ])

    });

    it('Does not allow an exp in the past', () => {
      let payload = ConformingData().payload();
      payload.exp = moment.utc().unix() - 30; // 30 seconds ago

      const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

      let promise = BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue);

      return promise.should.be.rejectedWith("\"exp\" claim timestamp check failed");
    });

    it('Does not allow an iat in the future', () => {
      let payload = ConformingData().payload();

      delete payload.exp; // modified to match the behaviour of jose/lib/jwt/verify.js, which only checks iat if exp is not supplied. This is reasonable and matches the expectation of https://tools.ietf.org/html/rfc7519#section-4.1.6

      payload.iat = moment.utc().unix() + 300; // 300 seconds in the future

      const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks(), { iat: false });

      let promise = BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue);

      return promise.should.be.rejectedWith("\"iat\" claim timestamp check failed (it should be in the past)");
    });

    it('Does not allow an nbf in the future', () => {
      let payload = ConformingData().payload();
      payload.nbf = moment.utc().unix() + 30; // 30 seconds ago

      const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks(), { iat: false });

      let promise = BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue);

      return promise.should.be.rejectedWith("\"nbf\" claim timestamp check failed");
    });

    describe('MandatoryValues', () => {

      it('Rejects if iss is not supplied', () => {
        let payload = ConformingData().payload();
        delete payload.iss;

        const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

        return (BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue)).should.be.rejectedWith("\"iss\" claim is missing")
      });

      it('Rejects if sub is not supplied', () => {
        let payload = ConformingData().payload();
        delete payload.sub;

        const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

        return (BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue)).should.be.rejectedWith("\"sub\" claim is missing")
      });
      it('Rejects if aud is not supplied', () => {
        let payload = ConformingData().payload();
        delete payload.aud;

        const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

        return (BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue)).should.be.rejectedWith("\"aud\" claim is missing")

      });
      it('Rejects if exp is not supplied', () => {
        let payload = ConformingData().payload();
        delete payload.exp;

        const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

        return (BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue)).should.be.rejectedWith("exp mandatory but not supplied")

      });
      it('Rejects if jti is not supplied', () => {
        let payload = ConformingData().payload();
        delete payload.jti;

        const authHeaderValue = "Bearer " + GetSignedJWT(payload, ConformingData().jwks());

        return (BearerJwtVerify("http://localhost:3000/revoke", "cdr-register", authHeaderValue)).should.be.rejectedWith("jti mandatory but not supplied")

      })
    });


    describe('BearerJwtVerify.SigningAlgorithm', () => {
      it('Only allows PS256', () => {
        // P-384 is not a whitelisted algorithm
        const ecHeaderValue = "Bearer " + JWT.sign(ConformingData().payload("client3"), jwks["client3"].get({alg:"RS256"}));

        return (BearerJwtVerify("http://localhost:3000/revoke", "client3", ecHeaderValue)).should.be.rejectedWith('alg not whitelisted');

      });

      /**
       * In this scenario, a request is received from Client 1 (as identified by the MTLS cert subject), but they use a JWT signed by Client 2 (with iss,sub=Client 2). This must be rejected.
       */
      it('Rejects a JWT from another client', () => {

        // Check that good request from Client 1 is accepted
        let client1ResultFulfilled = assert.isFulfilled(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client1",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client1"),
              ConformingData().jwks("client1")
            )
          ))


        // Check that good request from Client 2 is accepted
        let client2ResultFulfilled = assert.isFulfilled(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client2",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client2"),
              ConformingData().jwks("client2")
            )
          ))

        // Check that sneaky request from Client 1 (with JWT from Client 2; iss,sub=Client 2, signed with Client 2 private key) is rejected
        let sneakyResultRejected = assert.isRejected(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client1",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client2"),
              ConformingData().jwks("client2")
            )
          ), "no matching key found in the KeyStore")

        return Promise.all([client1ResultFulfilled, client2ResultFulfilled, sneakyResultRejected]).should.be.fulfilled;

      });
      /**
       * In this scenario, a request is received from Client 1 (as identified by the MTLS cert subject), but they use the private key of Client 2 to sign a JWT (with iss,sub=Client 1). This must be rejected.
       */
      it('Rejects a JWT signed by another client key', () => {

        // Check that good request from Client 1 is accepted
        let client1ResultFulfilled = assert.isFulfilled(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client1",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client1"),
              ConformingData().jwks("client1")
            )
          ))


        // Check that good request from Client 2 is accepted
        let client2ResultFulfilled = assert.isFulfilled(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client2",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client2"),
              ConformingData().jwks("client2")
            )
          ))
        // Check that sneaky request from Client 1 (with JWT; iss,sub=Client 1, signed with Client 2 private key) is rejected
        let sneakyResultRejected = assert.isRejected(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client1",
            "Bearer " + GetSignedJWT(
              ConformingData().payload("client1"),
              ConformingData().jwks("client2")
            )
          ), "no matching key found in the KeyStore")

        return Promise.all([client1ResultFulfilled, client2ResultFulfilled, sneakyResultRejected]).should.be.fulfilled;

      });

      it('Rejects a none algorithm signature', () => {

        let originalToken = GetSignedJWT(
          ConformingData().payload("client1"),
          ConformingData().jwks("client1")
        )

        let parts = originalToken.split(".");
        parts[0] = base64url(JSON.stringify({
          "alg": "none",
          "typ": "JWT" // TODO double check the expectation here about whether this typ is really needed
        }));

        parts[2] = base64url(JSON.stringify({}));

        let tamperedToken = parts.join(".");

        return assert.isRejected(
          BearerJwtVerify(
            "http://localhost:3000/revoke",
            "client1",
            "Bearer " + tamperedToken
          ), "alg not whitelisted")
      });

    })



  });
})