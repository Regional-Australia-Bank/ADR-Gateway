import { TestAction, TestActionResult } from "./TestActions";
import { injectable, inject, singleton } from "tsyringe"
import { ITestData, GenerateTestData } from "./TestData";
import path from "path"
import { logger } from "../../Logger";

// import { container } from "../UatTestContainer"
import uuid = require("uuid");
import { Dictionary } from "../../../Common/Server/Types";
import { SetValue } from "./SetValue";
import _ from "lodash"
import { E2ETestEnvironment } from "./E2ETestEnvironment";
import { runInNewContext } from "vm";
import { AxiosRequestConfig, AxiosResponse } from "axios"
import urljoin from "url-join";
import { axios } from "../../../Common/Axios/axios";
import fs from "fs"
import { MakeAndEnter, SafeFolderName, PushWriter, PopWriter, SafeFileName, TopWriter, QueueTestCleanup } from "./FileWriter";
import moment = require("moment");
import { Once } from "./Once";


export let currentlyExecutingContextStack:TestContext[] = [];

export interface HttpLogEntry {request:Express.Request, config:AxiosRequestConfig, response?: AxiosResponse<any>, error?:Error}

type ThenCallbackReturned = (Promise<void> | Promise<Chai.Assertion>);

const contextGroups:[any,Dictionary<TestContext>][] = []

export const GetContextGroup = (tag:any):Dictionary<TestContext> => {
    let groups = _.find(contextGroups,([t,collection]) => tag === t);
    if (typeof groups == 'undefined') {
        let newGroup = {}
        contextGroups.push([tag,newGroup])
        return newGroup;
    } else {
        return groups[1]
    }
}

const globalCollection:Dictionary<TestContext> = GetContextGroup(undefined);

class PartialContext {

    constructor(public testFnDefiner: (testDefFn:(scenarioId: string) => [string,() => ThenCallbackReturned]) => Mocha.Test, public persona: string | undefined, public description: string | undefined, public environment:E2ETestEnvironment) {

    }

    Given = (conditions: string): TestContext => {
        let newContext = TestContextFactory.NewContext(this.testFnDefiner, this.persona, conditions, this.description, GetContextGroup(this.environment),this.environment);
        if (typeof this.environment == 'undefined') throw 'Test context generated without environment'
        return newContext; 
    }

}

class TestContextFactory {
    static NewContext = (testFnDefiner: (testDefFn:(scenarioId: string) => [string,() => ThenCallbackReturned]) => Mocha.Test, persona: string | undefined, conditions: string, description: string | undefined, contextGroup:Dictionary<TestContext>, environment:E2ETestEnvironment) => {
        const newContext = new TestContext(testFnDefiner, persona, conditions, description, contextGroup, environment);
        return newContext;
    }
}

class TestContext extends PartialContext {
    collection: Dictionary<TestContext>;

    public kv:Dictionary<any> = {}

    TestData = async () => {
        return (await GenerateTestData(this.environment)).TestData
    }

    AdrGatewayConfig = async () => {
        return (await GenerateTestData(this.environment)).AdrGatewayConfig
    }

    _evidenceStarted:boolean = false;
    _evidenceFilename:string|undefined;
    _evidencePath:string|undefined;
    _evidencePathRelative:string|undefined;

    PushEvidenceWriter = () => {
        if (!this.environment.Config.EvidenceDir) return;
        let prevDir = process.cwd();
        try {
            if (!this._evidenceFilename) {
                if (this.environment.Config.EvidenceDir) {
                    MakeAndEnter(this.environment.Config.EvidenceDir)
                    MakeAndEnter(".work")
                    // if (!this.mochaContext) throw 'No mocha context'

                    let folderPath:string[] = [];
                    let current:{parent?:Mocha.Suite} = this.mochaTest;
                    while (current.parent) {
                        let stone = (<any>current.parent).title;
                        if (stone) folderPath.unshift(stone)                    
                        current = current.parent
                    }

                    let pathToNow:string[] = []
                    for (let step of folderPath) {
                        let folderName = SafeFolderName(step,pathToNow);
                        MakeAndEnter(folderName)
                        pathToNow.push(folderName)
                    }

                    let testTitle = (`${this.scenarioId} ${this.persona? "- " + this.persona : ""} - ${this.description}`);
                    this._evidencePath = path.resolve();
                    let filename = SafeFileName(testTitle)
                    this._evidencePathRelative = pathToNow.join("/")+"/"+filename+".txt"
                    this._evidenceFilename = path.resolve(filename)+".txt"
                }    
            }
            if (!this._evidenceFilename) throw 'Could not determine file name for evidence'
            let file = PushWriter(this._evidenceFilename, this._evidencePathRelative)
            if (!this._evidenceStarted) {
                fs.writeSync(file,`SCENARIO:   ${this.scenarioId}\r\n`)
                fs.writeSync(file,`EXPECT:     ${this.description}\r\n`)
                fs.writeSync(file,`GIVEN:      ${this.conditions}\r\n`)
                fs.writeSync(file,`PERSONA:    ${this.persona}\r\n`)
                fs.writeSync(file,`STARTED:    ${moment().toLocaleString()}\r\n`)
                fs.writeSync(file,`\r\n`)    
                this._evidenceStarted = true;
            }

            this._evidenceWriterPushed = true;
        } catch (e) {
            logger.error("Bad 1")
            logger.error(e)
            process.kill(process.pid)
            throw e
        } finally {
            process.chdir(prevDir)
        }
    }

    _evidenceWriterPushed:boolean;

    PopEvidenceWriter = () => {
        try {
            if (!this.environment.Config.EvidenceDir) return;
    
            let poppedRelativePath = PopWriter()
            let newTop = TopWriter()

            if (this.scenarioId.includes("TS_051")) {
                if ((poppedRelativePath) && (newTop?.relativePath) && (newTop?.relativePath !== poppedRelativePath)) {
                    process.stdout.write(`\r\nEVIDENCE: This test case relies on the execution of another. Further evidence may be found at ${poppedRelativePath}\r\n`)
                }    
            } else {
                if ((poppedRelativePath) && (newTop?.relativePath) && (newTop?.relativePath !== poppedRelativePath)) {
                    process.stdout.write(`\r\nEVIDENCE: This test case relies on the execution of another. Further evidence may be found at ${poppedRelativePath}\r\n`)
                }    
            }
    
        } catch (e) {
            logger.error("Bad 2")
            logger.error(e)
            process.kill(process.pid)
            throw e
        }
    }

    RestoreWriters = () => {

    }

    conditions: string;
    scenarioId!: string;

    mochaContext?: Mocha.Context;
    mochaTest!: Mocha.Test;

    preconditions: {description:string, cond:(ctx:TestContext) => void|Promise<void>}[]

    preActions: TestAction<TestActionResult>[];
    observedAction: TestAction<TestActionResult> | undefined;

    allActions: TestAction<TestActionResult>[]

    testCallback!: (ctx: TestContext) => Promise<any>;
    timeoutSeconds: number;

    constructor(testFnDefiner: (testDefFn:(scenarioId: string) => [string,() => ThenCallbackReturned]) => Mocha.Test, persona: string | undefined, conditions: string, description: string | undefined, collection:Dictionary<TestContext>, environment:E2ETestEnvironment) {
        super(testFnDefiner, persona, description, environment);
        this.conditions = conditions;
        this.preconditions = [];
        this.preActions = [];
        this.allActions = [];
        this.timeoutSeconds = 10;
        this.collection = collection;
    }

    GetInstance = (
        action: Class<TestAction<TestActionResult>>,
        taskId?: any
    ) => {
        for (let a of this.allActions) {
            if (a instanceof action) {
                if (typeof taskId == 'undefined') {
                    return a;
                }
                if (taskId == a.taskId) {
                    return a;
                }
            }
        }
        throw `Could not get instance of ${action.name}. TaskId: ${taskId} `;
    }

    GetResult = async <T extends TestAction<TestActionResult>>(
        action: Class<T>,
        taskId?: any
    ): Promise<ReturnType<T["Perform"]>> => {
        try {
            this.PushEvidenceWriter()
            let inst = this.GetInstance(action,taskId);
            let result = <any> await inst.GetResult();
            return result;
        } finally {
            // await new Promise(resolve => setTimeout(resolve, 1000))
            this.PopEvidenceWriter()
        }
        // return Action.
    }

    GetValue = async (name:string|symbol) => {
        logger.debug(`GetValue(${name.toString()})`);
        let value = (await this.GetResult(SetValue,name)).value;
        logger.debug(value)
        return value
    }

    When = <T extends TestAction<TestActionResult>>(
        action?: Class<T>,
        options?: ((ctx: TestContext) => T["parameters"]) | ((ctx: TestContext) => Promise<T["parameters"]>) | (object & T["parameters"]),
        taskId?: any
    ): TestContext => {
        if (typeof action == 'undefined') {
            return this.When(SetValue,undefined)
        }

        let newAction = new action(this);
        newAction.parameters = options;
        newAction.taskId = taskId || uuid.v4();

        let previousAction = _.last(this.allActions);

        if (previousAction) {
            newAction.prev = async () => await previousAction.GetResult()
        } else {
            newAction.prev = newAction.testContext.AssertPreconditions;
        }

        // register the action internally 
        this.observedAction = newAction;
        this.allActions.push(newAction);

        return this;
    }

    Precondition = <T extends TestAction<TestActionResult>>(
        description: string,
        cond: ((ctx: TestContext) => void|Promise<void>)
    ): TestContext => {

        this.preconditions.push({description,cond});

        return this;
    }

    Skip = () => {
        return this.Precondition('Test implemented',() => {throw 'Not implemented'})
    }

    SkipIfBehindProxy = () => {
        return this.Precondition('Is not behind proxy',() => {throw 'Precondition check not implemented'})
    }


    PreTask = <T extends TestAction<TestActionResult>>(
        action: Class<T>,
        options?: ((ctx: TestContext) => T["parameters"]) | ((ctx: TestContext) => Promise<T["parameters"]>) | (object & T["parameters"]),
        taskId?: any
    ): TestContext => {
        let newAction = new action(this);
        newAction.parameters = options;
        newAction.taskId = taskId || uuid.v4();

        let previousAction = _.last(this.allActions);

        if (previousAction) {
            newAction.prev = async () => await previousAction.GetResult()
        } else {
            newAction.prev = newAction.testContext.AssertPreconditions;
        }

        // register the action internally
        this.preActions.push(newAction);
        this.allActions.push(newAction);

        return this;
    }

    requestLog:HttpLogEntry[] = []

    GetMatchingHttpRequests = (method?:"POST"|"GET"|"PUT"|"DELETE", urlMatcher?:string | RegExp) => {
        return _.filter(this.requestLog,l => {
            let url = <string>(<any>l.request).path;

            if (method) {
                if (l.config.method?.toUpperCase() !== method) return false;                
            }
            if (typeof urlMatcher == 'string') {
                return url.includes(urlMatcher)
            } else if (typeof urlMatcher !== 'undefined') {
                return urlMatcher.test(url)                
            }
        })
    }

    GetOnlyHttpRequest = (method:"POST"|"GET"|"PUT", urlMatcher:string | RegExp) => {
        let matches = this.GetMatchingHttpRequests(method,urlMatcher)

        if (matches.length == 1) {
            return matches[0]
        } else {
            throw 'Expected exactly one matching request'
        }
    }

    GetLastHttpRequest = (method?:"POST"|"GET"|"PUT"|"DELETE", urlMatcher?:string | RegExp) => {
        let matches = this.GetMatchingHttpRequests(method,urlMatcher)

        let match = _.last(matches);
        if (!match) {
            throw 'Expected at least one matching request'
        } else {
            return match
        }

    }

    _doTestPromise?:Promise<any>

    // Wraps _DoTest to ensure that the work is only done once
    DoTest = async (mocha: Mocha.Context) => {
        this.PushEvidenceWriter()
        if (typeof this._doTestPromise === 'undefined') {
            this._doTestPromise = this._DoTest(mocha)
        }

        try {
            await this._doTestPromise
        } catch (e) {
            logger.error(e)
        } finally {
            QueueTestCleanup({
                _doTestPromise: this._doTestPromise,
                _evidenceFilename: this._evidenceFilename
            })
    
            this.PopEvidenceWriter();
            return await this._doTestPromise
        }

    }

    _DoTest = async (mocha: Mocha.Context) => {

        let requestResolutions:{config:any, resolve: any, promise:Promise<any>}[] = []


        let testPromise:Promise<any> = Promise.resolve("SKIPPED")
        let tearDownPrequisites:Promise<any>[] = [];

        try {
            currentlyExecutingContextStack = [this];


            const resolveRequest = (config:any) => {
                let resolution = _.find(requestResolutions, r => r.config === config);
                if (!resolution) throw 'Resolution not found'
                resolution.resolve(true)
            }

            let req_interceptor = axios.interceptors.request.use((req) => {
                let resolve:any = undefined;
                let promise = new Promise((promiseResolve,promiseReject) => {
                    resolve = promiseResolve;
                })
                requestResolutions.push({
                    config:req,
                    resolve,
                    promise
                })
                return req;
            },(err) => {
                try {
                    logger.error("Failed request:")
                    logger.debug(err.request._requestBody);
                    logger.debug("Response:")
                    logger.debug(JSON.stringify(_.pick(err.response,'headers','status','statusText','data')))
                    logger.error(err);
                    throw(err)
                } finally {
                    resolveRequest(err.config)
                }
            })
    
            let res_interceptor = axios.interceptors.response.use((res) => {
                try {
                    let newLogEntry:HttpLogEntry = {request: res.request, config:res.config, response: res}
    
                    _.last(currentlyExecutingContextStack)?.requestLog.push(newLogEntry);
        
                    logger.debug("Successful request:")
                    logger.debug(res.config);
                    logger.debug("Response:")
                    logger.debug(JSON.stringify(_.pick(res,'headers','status','statusText','data')))
                    return res;
    
                } finally {
                    resolveRequest(res.config)
                }
            },<any>((err:any,arg:any) => {
                try {
                    let newLogEntry:HttpLogEntry = {request: err.request, config:err.config, response: err.response, error: err}
        
                    _.last(currentlyExecutingContextStack)?.requestLog.push(newLogEntry);
        
                    logger.error("Failed request:")
                    let request = err.config || err
                    logger.debug(request);
                    logger.debug("Response:")
                    logger.debug(JSON.stringify(_.pick(err.response,'headers','status','statusText','data')))
                    logger.error(err);
                    throw(err)
                } finally {
                    resolveRequest(err.config)
                }
            }))
    
            try {
                for (let precondition of this.preconditions) {
                    try {
                        await Once(precondition.cond,this);
                    } catch (e) {
                        logger.warn(`Skipping test case ${this.description} due to missing precondition: ${precondition.description}`)
                        logger.error(e)
                        this.mochaContext?.skip()                
                    }
                }
        
                for (let action of this.preActions) {
                    await action.GetResult();
                }
        
                if (typeof this.observedAction == 'undefined') throw 'No test subject to observe. Call When()';
        
                await this.observedAction.GetResult();
        
                testPromise = this.testCallback.call(mocha, this);
                tearDownPrequisites.push(new Promise(resolve => testPromise.then(resolve,resolve)))
                return await testPromise;
            } catch (e) {
                throw(e)
            } finally {

                // let allRequestsResolved = Promise.all(_.map(requestResolutions, r => r.promise))
                // tearDownPrequisites.push(allRequestsResolved)
                
                axios.interceptors.request.eject(req_interceptor)
                axios.interceptors.response.eject(res_interceptor)
                // await new Promise(resolve => setTimeout(resolve,1000))
            }    
        } catch (e) {
            throw(e)
        } finally {
            await Promise.all(tearDownPrequisites);
        }

    }

    /**
     * Start the execution of the PreTasks and the observable (When)
     * @param testCallback 
     */

    Then = (testCallback: (ctx: TestContext) => ThenCallbackReturned, timeoutSeconds: number = 30) => {
        this.testCallback = testCallback;
        this.timeoutSeconds = timeoutSeconds;

        //(`${this.scenarioId} - ${this.description}` + (this.persona ? `(${this.persona})` : "")

        let testCase = this;

        let mochaTest = this.testFnDefiner((scenarioId:string) => {
            this.scenarioId = scenarioId;
            let testTitle = (`${this.scenarioId} - ${this.description}` + (this.persona ? `(${this.persona})` : ""));
            const mochaTestFn = async function () {
                testCase.mochaContext = this;
                return await testCase.DoTest(testCase.mochaContext)
            }
            return [testTitle, mochaTestFn]
        });
        mochaTest.timeout(timeoutSeconds * 1000);
        this.mochaTest = mochaTest;

        return this;
    }

    Keep = (name:Symbol|string) => {
        if (typeof this.collection[name.toString()] !== 'undefined') throw 'This name is already taken'
        this.collection[name.toString()] = this;
    }

    AssertPreconditions = async () => {
        for (let precondition of this.preconditions) {
            await Once(precondition.cond,this);
        }
    }

    // Used to include the test conditions of another test case
    Proxy = (names: RegExp | symbol | string | [string,...string[]], timeoutSeconds: number = 10, collection?:Dictionary<TestContext>) => {

        let searchCollection = collection || this.collection;
        let testCase = this;
        const contexts = TestContext.GetTestContexts(names,searchCollection);
        //const ctx = TestContext.GetTestContext(name);
        const aggTimeout = _.sum(_.map(contexts,ctx => ctx.timeoutSeconds)) + timeoutSeconds


        let mochaTest = this.testFnDefiner((scenarioId:string) => {
            this.scenarioId = scenarioId;
            let testTitle = (`${this.scenarioId} - ${this.description}` + (this.persona ? `(${this.persona})` : ""));
            const mochaTestFn = async function () {
                testCase.mochaContext = this
                testCase.PushEvidenceWriter()
                let promises:Promise<any>[] = [Promise.resolve()];
                let lastPromise:Promise<any>;
                for (let ctx of contexts) {
                    // assert the preconditions of proxied
                    for (let precondition of ctx.preconditions) {
                        try {
                            await Once(precondition.cond,ctx);
                        } catch (e) {
                            logger.warn(`Skipping test case ${this.description} due to missing precondition: ${precondition.description}`)
                            logger.error(e)
                            return testCase.mochaContext?.skip()                
                        }
                    }
                        
                    lastPromise = <Promise<any>>_.last(promises);
                    let nextPromise = lastPromise!.then(() => {
                        return ctx.DoTest(this)
                    })
                    promises.push(nextPromise)
                }
                // The final promise reflect the result of the "Proxy"
                let finalPromise = _.last(promises);

                try {
                    await finalPromise
                } finally {
                    QueueTestCleanup({
                        _doTestPromise: finalPromise,
                        _evidenceFilename: testCase._evidenceFilename
                    })
                           
                    testCase.PopEvidenceWriter();
                    return await finalPromise;
                }

                
            }
            return [testTitle, mochaTestFn]
        });
        this.mochaTest = mochaTest;
        mochaTest.timeout(aggTimeout * 1000);

    }

    GetTestContext = (names: symbol) => {
        return TestContext.GetTestContext(names,this.collection)
    }

    static GetTestContext = (names: symbol ,collection:Dictionary<TestContext> = globalCollection):TestContext => {
        let contexts = TestContext.GetTestContexts(names,collection);
        return contexts[0];
    }

    static GetTestContexts = (names: RegExp | string | symbol | [string,...string[]],collection:Dictionary<TestContext>):TestContext[] => {
        
        let contexts:TestContext[];
        if (typeof names == 'string') {
            contexts = [collection[names]]
        } else if (typeof names == 'symbol') {
            contexts = [collection[names.toString()]]
        } else if (Array.isArray(names)) {
            contexts = _.map(names,name => collection[name])
        } else {
            // regex
            contexts = _.map(_.filter(_.keys(collection),name => names.test(name)),name => collection[name])
        }
        if (contexts.length < 1) throw 'Cannot find a test context by that name';
        return contexts;
    }

}


function Scenario(testFnDefiner: (testDefFn:(scenarioId: string) => [string,() => ThenCallbackReturned]) => Mocha.Test, persona: string | undefined,environment:E2ETestEnvironment, description?: string | undefined, ): PartialContext {
    return new PartialContext(testFnDefiner, persona, description, environment);
}

export { Scenario, TestContext }