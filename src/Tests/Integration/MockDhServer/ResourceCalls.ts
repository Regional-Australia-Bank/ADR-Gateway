import { expect, } from 'chai';
import 'mocha';
import { ConformingData } from '../Common.TestData.Dh';
import request from 'supertest';
import { container } from '../../../MockServices/DhServer/DhDiContainer';
import { DhServer } from '../../../MockServices/DhServer/Server/server';

import {RegisterTestDependencies} from "./Dependencies" 
import { Connection } from 'typeorm';

export const Tests = (() => {

  let app:DhServer;

  describe('DhServer', async () => {

    before(async () => {
      RegisterTestDependencies();
      await ConformingData().init();
      app = await container.resolve(DhServer).init();
    })
    
    after(async () => {
      let connection = await <Promise<Connection>>container.resolve("Promise<Connection>")
      await connection.close();
      container.reset();
    })
    
    describe('Resource Calls', async () => {

      describe('Authenticated calls', async () => {

        it('Returns 200 for valid token', async () => {
    
          const result = await request(app)
              .get("/banking/accounts")
              .set("x-cdrgw-cert-clientid","client2")
              .set("x-cdrgw-cert-thumbprint","client2-THUMBPRINT")
              .set("x-cds-subject","john")
              .set("x-fapi-auth-date","Sun, 06 Nov 1994 08:49:37 GMT")
              .set("x-v","1")
              .set("Authorization", "Bearer " + "access-token-2");
          expect(result.status).to.equal(200);

        });

        it('Returns unauthorized if x-fapi-auth-date is not supplied', async () => {
    
          const result = await request(app)
              .get("/banking/accounts")
              .set("x-cdrgw-cert-clientid","client2")
              .set("x-cdrgw-cert-thumbprint","client2-THUMBPRINT")
              .set("x-cds-subject","john")
              .set("x-v","1")
              .set("Authorization", "Bearer " + "access-token-2");
          expect(result.status).to.equal(401);

        });

        it('Returns unauthorized if x-fapi-auth-date is not HTTP-date as in section 7.1.1.1 of [RFC7231]', async () => {
          const result = await request(app)
              .get("/banking/accounts")
              .set("x-cdrgw-cert-clientid","client2")
              .set("x-cdrgw-cert-thumbprint","client2-THUMBPRINT")
              .set("x-cds-subject","john")
              .set("x-fapi-auth-date","Sunday the week after Elvis died.")
              .set("x-v","1")
              .set("Authorization", "Bearer " + "access-token-2");
          expect(result.status).to.equal(401);
        });

        it('Returns unauthorized if x-cds-subject is not supplied', async () => {
          // spec is not clear when x-cds-subject is required, or its purpose
          // https://github.com/ConsumerDataStandardsAustralia/standards-maintenance/issues/13#issuecomment-547677620

          const result = await request(app)
              .get("/banking/accounts")
              .set("x-cdrgw-cert-clientid","client2")
              .set("x-cdrgw-cert-thumbprint","client2-THUMBPRINT")
              .set("x-cds-subject","john")
              .set("x-fapi-auth-date","Sun, 06 Nov 1994 08:49:37 GMT")
              .set("x-v","1")
              .set("Authorization", "Bearer " + "access-token-2");
          expect(result.status).to.equal(401);
        });

        it('Returns unauthorized if x-cds-subject access token does not match HoK client', async () => {
          const result = await request(app)
              .get("/banking/accounts")
              .set("x-cdrgw-cert-clientid","client1")
              .set("x-cdrgw-cert-thumbprint","client1-THUMBPRINT")
              .set("x-cds-subject","john")
              .set("x-fapi-auth-date","Sun, 06 Nov 1994 08:49:37 GMT")
              .set("x-v","1")
              .set("Authorization", "Bearer " + "access-token-2");
          expect(result.status).to.equal(401);
        });

        /**
         * Customer present calls are indicated by the presence of a x-fapi-customer-ip-address header.
         */
        describe('Customer present calls', async () => {

          it('Returns bad-request if x-fapi-customer-ip-address is not an IPv4 or IPv6 address', async () => {
            const result = await request(app)
            .get("/banking/accounts")
            .set("x-cdrgw-cert-clientid","client1")
            .set("x-cdrgw-cert-thumbprint","client1-THUMBPRINT")
            .set("x-cds-subject","john")
            .set("x-fapi-auth-date","Sun, 06 Nov 1994 08:49:37 GMT")
            .set("x-v","1")
            .set("x-fapi-customer-ip-address","1")
            .set("Authorization", "Bearer " + "access-token-2");
            expect(result.status).to.equal(401);
          });

          it('Returns bad-request if x-cds-User-Agent is not supplied', async () => {
            return Promise.reject('Test not yet implemented').should.be.fulfilled;
          });

          it('Returns 200 OK if x-fapi-customer-ip-address is valid IP address and x-cds-User-Agent is supplied', async () => {
            return Promise.reject('Test not yet implemented').should.be.fulfilled;
          });

        });

      });

      describe('Unauthenticated calls', async () => {

        it('x-fapi-interaction-id is played back in response when included in request', async () => {
          return Promise.reject('Test not yet implemented').should.be.fulfilled;
        });

        it('x-fapi-interaction-id is played back in response as a generated [RFC4122] UUID value when not included in request', async () => {
          return Promise.reject('Test not yet implemented').should.be.fulfilled;
        });

      });

      
      describe('Pagination', async () => {

        it('todo', async () => {
          return Promise.reject('Test not yet implemented').should.be.fulfilled;
        });

      });

      describe('Filtering', async () => {

        it('todo', async () => {
          return Promise.reject('Test not yet implemented').should.be.fulfilled;
        });

      });

    });

  });

})