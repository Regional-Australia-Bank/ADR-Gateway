import { Scenario, TestContext } from "./Framework/TestContext";
import { DoRequest } from "./Framework/DoRequest";
import { expect } from "chai";
import * as _ from "lodash"
import { SetValue } from "./Framework/SetValue";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";

export const Tests = ((environment:E2ETestEnvironment) => {


    Scenario($ => it.apply(this,$('Environment up')), undefined, environment, 'Can contact AdrServer')
        .Given('Cold start')
        .When(DoRequest,{requestOptions:{
            method: "GET",
            url: environment.SystemUnderTest.AdrGateway().FrontEndUrls.JWKSEndpoint,
            responseType:"json"
        }})
        .Then(async ctx => {
            let requestResult = await (ctx.GetResult(DoRequest));
            expect(requestResult.response.status).to.equal(200);
        })

})