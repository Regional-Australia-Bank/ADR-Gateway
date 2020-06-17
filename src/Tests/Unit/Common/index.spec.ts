import "reflect-metadata";

import chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import spies from "chai-spies";

chai.use(chaiAsPromised);
chai.use(spies);
chai.should();

describe('Unit Tests', async () => {
    require("./ConnectivityNeurons").Tests()
    require("./BearerJWTVerify").Tests()
})
