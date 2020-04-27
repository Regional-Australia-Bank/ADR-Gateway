import request from "supertest";
import { expect, assert } from 'chai';
import { AdrServer } from "../../../AdrServer/Server/server"
import {RegisterTestDependencies} from "./Dependencies" 
import { Connection, MoreThan, Not, IsNull } from "typeorm";
import moment from "moment";
import { container } from "../../../AdrServer/AdrDiContainer";
import { ConsentRequestLog } from "../../../AdrGateway/Entities/ConsentRequestLog";
import { ConformingDataProvider } from "../Common.TestData.Adr";
import { GetSignedJWT } from "../../Unit/Common/JWT";
import { JWT } from "jose";

export const Tests = (() => {

    function ConformingData() {
        return container.resolve(ConformingDataProvider)
    }

    let app: ReturnType<AdrServer["init"]>;

    describe('AdrServer', async () => {

        before(async () => {
            RegisterTestDependencies();
            await ConformingData().init();
            app = container.resolve(AdrServer).init();
        })
        
        after(async () => {
            let connection = await <Promise<Connection>>container.resolve("Promise<Connection>")
            await connection.close();
            container.reset();
        })

        describe('JWKS endpoint', async () => {
            it('Unauthenticated request returns JWKS', async () => {
                const result = await request(app).get("/jwks");
                expect(result.status).to.equal(200);
            });

        })

        describe('Revocation endpoint MOVE to E2E', async () => {
            /**
             * Request to revoke token for consent against another data holder does not actually REVOKE a token, but returns 200
             */
            it('Revocation of Access Tokens MUST not be supported.', async () => {
                const testConsent = {refreshToken: "refresh-token-1" ,accessToken: "access-token-1",client:"client1"};
                    
                let resolvedConnection = await container.resolve<Promise<Connection>>("Promise<Connection>");
                let t0count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                });
    
                expect(t0count).to.equal(1);
    
                const result = await request(app)
                    .post("/revoke")
                    .type('form')
                    .send({
                        token: testConsent.accessToken,
                        client_id: "client1",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion: GetSignedJWT(
                            ConformingData().payload("client1","https://adr.mocking/security/revoke"),
                            ConformingData().jwks("client1")
                            )
                    })
                    .set("x-v","1")
                expect(result.status).to.equal(400);

                let t1count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                });

                expect(t1count).to.equal(1);
            });

            //tls must be used
            //must be post
            // token_type_hint is ignored
            it('Revocation of refresh token must be supported. returns 200', async () => {
                const testConsent = {refreshToken: "refresh-token-1" ,accessToken: "access-token-1",client:"client1"};
                    
                let resolvedConnection = await container.resolve<Promise<Connection>>("Promise<Connection>");
                let t0count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                });
    
                expect(t0count).to.equal(1);
    
                const result = await request(app)
                    .post("/revoke")
                    .type('form')
                    .send({
                        token: testConsent.refreshToken,
                        client_id: "client1",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion: GetSignedJWT(
                            ConformingData().payload("client1","https://adr.mocking/security/revoke"),
                            ConformingData().jwks("client1")
                            )
                    })
                    .set("x-v","1")
                expect(result.status).to.equal(200);

                let t1count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                })

                expect(t1count).to.equal(0);
            });

            it('Revocation of unknown token also returns 200', async () => {
                //rfc7009 Section 2.2
                const testConsent = {refreshToken: "fake-token" ,accessToken: "access-token-1",client:"client1"};
                    
                let resolvedConnection = await container.resolve<Promise<Connection>>("Promise<Connection>");
                let t0count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                });
    
                expect(t0count).to.equal(0);
    
                const result = await request(app)
                    .post("/revoke")
                    .type('form')
                    .send({
                        token: testConsent.refreshToken,
                        client_id: "client1",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion: GetSignedJWT(
                            ConformingData().payload("client1","adr.mocking/security/revoke"),
                            ConformingData().jwks("client1")
                            )
                    })
                    .set("x-v","1")
                expect(result.status).to.equal(200);

                let t1count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                })

                expect(t1count).to.equal(0);                
            });

            //rfc7009
            it('Attempted revocation of access token returns 400', async () => {
                //rfc7009 Section 2.2.1
                const testConsent = {refreshToken: "refresh-token-2" ,accessToken: "access-token-2",client:"client2"};
                    
                let resolvedConnection = await container.resolve<Promise<Connection>>("Promise<Connection>");
                let t0count = await resolvedConnection.getRepository(ConsentRequestLog).count({
                    refreshToken: testConsent.refreshToken,
                    accessToken: testConsent.accessToken,
                    dataHolderId: testConsent.client,
                    revocationDate: IsNull()
                });
    
                expect(t0count).to.equal(1);
    
                const result = await request(app)
                    .post("/revoke")
                    .type('form')
                    .send({
                        token: testConsent.refreshToken,
                        client_id: "client1",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion: GetSignedJWT(
                            ConformingData().payload("client1","https://adr.mocking/security/revoke"),
                            ConformingData().jwks("client1")
                            )
                    })
                    .set("x-v","1")
                expect(result.status).to.equal(400);
            });




        })

        describe('Dynamic client registration MOVE TO E2E', async () => {

            describe('Dynamic client registration will fail as long as there is an active software product.', async () => {
                // This expectation is based on the constrant that a software product should never have two registrations with a data holder.
                // This would have terrible effects (e.g. disabling access for all consents under that client)
            })

            describe('Two registration requests sent for the same dataholder do not result in two active registrations.', async () => {
                // Perhaps check and update as a transaction
            })


        })
    })

})