import "reflect-metadata";

import chaiAsPromised from 'chai-as-promised';
import * as chai from 'chai';
import * as _ from 'lodash';
import { GetEnvironments, TestConfigBase } from "./Environments";

import { Tests as CdrRegisterTests } from "./E2E-UAT-Scenarios.CdrRegister";
import { Tests as SecurityProfileTests } from "./E2E-UAT-Scenarios.SecurityProfile";
import { Tests as DynamicClientRegistrationTests } from "./E2E-UAT-Scenarios.DynamicClientRegistration";
import { Tests as ApiTests } from "./E2E-UAT-Scenarios.Apis";
import { MakeAndEnter, ExecuteTestCleanup } from "./Framework/FileWriter";
import fs from "fs"
import { TestContext } from "./Framework/TestContext";
import { E2ETestEnvironment } from "./Framework/E2ETestEnvironment";
const rimraf = require("rimraf")
import { logger } from "../Logger";

process.on("unhandledRejection", (error) => {
    logger.error(error); // This prints error with stack included (as for normal errors)
    throw error; // Following best practices re-throw error and let the process exit with error code
});

chai.use(chaiAsPromised);
chai.should();


const GenerateTests = (environment:E2ETestEnvironment) => {
    let prevDir = process.cwd()
    let envDir;

    describe(environment.Name, async () => {

        before(async function() {
            this.timeout(10000);
            if (environment.Name != 'Mock test environment') {
                envDir = TestConfigBase()
                process.chdir(envDir);
            }
            logger.debug(`Starting environment: ${environment.Name}`)

            if (environment.Config.EvidenceDir) {
                try {
                    MakeAndEnter(environment.Config.EvidenceDir)
                    if (fs.existsSync(".work")) {
                        logger.debug('The path exists.');
                        let deletedPromise = new Promise((resolve,reject) => rimraf('.work', (err?:any) => {
                            if (err) {
                                reject(err)
                            } else {
                                resolve()
                            }
                        }))
                        await deletedPromise;
                    }
                    MakeAndEnter(".work")

                } finally {
                    process.chdir(envDir || prevDir)
                }
            }

            try {
                return await environment.Start();
            } catch (e) {
                logger.error(e)
            }
        })

        CdrRegisterTests(environment);

        DynamicClientRegistrationTests(environment);

        SecurityProfileTests(environment);
    
        ApiTests(environment);

        // require("./Up").Tests(environment)

        after(async function() {
            this.timeout(10000)
            logger.debug(`Stopping environment: ${environment.Name}`)
            try {
                await ExecuteTestCleanup(environment);
            } finally {
                await environment.Stop();
                logger.debug(`Stopped environment: ${environment.Name}`)
            }
            if (environment.Name != 'Mock test environment') {
                process.chdir(prevDir);
            }
        })

    })    
}



describe('E2E Scenarios', async () => {
   
    let {liveTestEnvironments, mockEvironment} = GetEnvironments();

        GenerateTests(mockEvironment)

        if (!process.env.TEST_SUITE_MOCK_ONLY) {
            describe("Live environments", async () => {
            for (let environment of liveTestEnvironments) {
                GenerateTests(environment)  
            }    
        })    
    }

})
