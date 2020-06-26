import "reflect-metadata";

import chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import spies from "chai-spies";

chai.use(chaiAsPromised);
chai.use(spies);
chai.should();

// describe('Other integration tests', async () => {
//     // require("./AdrServer/AdrServer.Integration").Tests()
//     // require("./MockDhServer/ResourceCalls").Tests()

//     it.skip('AdrGateway checks sub of userinfo response and returns 409 in case of sub mismatch')

//     it.skip('DH allows a new key to be used in a subsequent session (HoK)')

//     it.skip('Given two certs with the same subject identifier and issuer, only one can be used (HoK)')

// })
