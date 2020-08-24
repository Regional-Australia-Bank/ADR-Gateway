import fs from "fs"
import _ from "lodash"
import e from "express";
import path from "path"
import { E2ETestEnvironment } from "./E2ETestEnvironment";
import moment from "moment"
import { logger } from "../../Logger";

const LOG_FILE = path.resolve(process.cwd(),"FileWriter.log")

fs.writeFileSync(LOG_FILE,'',{flag:'w'})

export const FileWriter = (originalWrite:any, originalStream:NodeJS.WritableStream, file:number, filename:string, content: Uint8Array | string, encodingOrCallback?: string | ((err?: Error) => void), cb?:((err?: Error) => void)):boolean => {
    const encoding:string|undefined = (typeof encodingOrCallback === 'string') ? encodingOrCallback : undefined; 
    const callback = (encoding ? cb : encodingOrCallback) || ((err?:Error) => {});
    if (typeof callback === 'string') {
        throw 'callback is a string'
    }

    try {
        if (encoding) {
            originalWrite.call(originalStream,content,encoding)
            if (typeof content == 'string') {
                fs.writeFileSync(LOG_FILE,`Filewriter write to ${file} ${JSON.stringify(content)}\r\n`,{flag:'a'})

                fs.writeSync(file,Buffer.from(content,<BufferEncoding>encoding))
            } else {
                fs.writeFileSync(LOG_FILE,`Filewriter write to ${file} ${JSON.stringify(content)}\r\n`,{flag:'a'})
                fs.writeSync(file,content)
            }
        } else {
            originalWrite.call(originalStream,content)
            if (typeof content == 'string') {
                fs.writeFileSync(LOG_FILE,`Filewriter write to ${file} ${JSON.stringify(content)}\r\n`,{flag:'a'})
                fs.writeSync(file,Buffer.from(content))
            } else {
                fs.writeFileSync(LOG_FILE,`Filewriter write to ${file} ${JSON.stringify(content)}\r\n`,{flag:'a'})
                fs.writeSync(file,content)
            }
        }    
    } catch (e) {
        throw e
    }
    return true;
}

let fileCounter = 0;
let dirCounter = 0;
const NUM_PADDING=4;
const MAX_LENGTH=50;
const MAX_RIGHT = MAX_LENGTH - NUM_PADDING - 1;

export const SafeFileName = (s:string) => {
    fileCounter++;
    fileCounter.toFixed()
    let numStr = `${fileCounter}`;
    let left = _.map(_.range(NUM_PADDING - numStr.length),() => "0").join("")+numStr;

    let right = _.filter(_.map(s),c => {
        if (/^[a-zA-Z0-9\-_\. ]$/.test(c)) return true;
    }).join("").substr(0,MAX_RIGHT)
    return `${right} (${left})`.trim()
}

const safeFolderNames:{
    in: string,
    pathJson: string,
    out:string
}[] = [];

export const SafeFolderName = (s:string,pathToNow:string[]) => {
    let pathJson = JSON.stringify(pathToNow)
    let found = _.find(safeFolderNames, n => n.pathJson === pathJson && n.in === s);
    if (found) {
        return found.out
    }

    dirCounter++;
    dirCounter.toFixed()
    let numStr = `${dirCounter}`;
    let left = _.map(_.range(NUM_PADDING - numStr.length),() => "0").join("")+numStr;

    let right = _.filter(_.map(s),c => {
        if (/^[a-zA-Z0-9\-_\. ]$/.test(c)) return true;
    }).join("").substr(0,MAX_RIGHT)
    let out = `${right} (${left})`;
    safeFolderNames.push({
        in:s,
        pathJson,
        out
    })
    return out
}

export const MakeAndEnter = (dir:string) => {
    try {
        fs.mkdirSync(dir,{recursive:true})
    } finally {
        process.chdir(dir)
    }
}

interface File {filename:string, relativePath:string ,number:number|undefined}

const fileStack:File[] = [];

const originalStdOutWrite = process.stdout.write;
const originalStdErrWrite = process.stderr.write;
(<any>originalStdOutWrite).easyName = "STDOUT";
(<any>originalStdErrWrite).easyName = "STDERR";

export const PushWriter = (filename:string,relativePath:string) => {
    fs.writeFileSync(LOG_FILE,`PushWriter ${filename}\r\n`,{flag:'a'})
    try {
        let top: {number:number|undefined, filename:string, relativePath:string}|undefined
        if (fileStack.length > 0) {
            top = _.last(fileStack);
        }
    
        let file:number|undefined;
        try {
            if (top?.number) {
                fs.closeSync(top.number);
            }
            file = fs.openSync(filename,'a')
            process.stdout.write = FileWriter.bind(this,originalStdOutWrite,process.stdout,file,filename);
            process.stderr.write = FileWriter.bind(this,originalStdErrWrite,process.stderr,file,filename);
            (<any>process.stdout.write).easyName = filename;
            (<any>process.stderr.write).easyName = filename;
        } catch {
            file = undefined;
        } finally {
            fileStack.push({filename,number:file,relativePath})
            fs.writeFileSync(LOG_FILE,`FileStack added ${JSON.stringify({filename,number:file,relativePath})}\r\n`,{flag:'a'})
            fs.writeFileSync(LOG_FILE,`+ PushWriter pushed ${fileStack.length} ${filename}\r\n`,{flag:'a'})
            fs.writeFileSync(LOG_FILE,`: TopWriter is ${file} ${filename}\r\n`,{flag:'a'})

            return file
        }    
    } catch (e) {
        logger.error("Bad 3")
        logger.error(e)
        process.kill(process.pid)
        throw e
    }
}

export const TopWriter = () => {
    return _.last(fileStack)
}

export const PopWriter = ():string => {
    fs.writeFileSync(LOG_FILE,`PopWriter ${fileStack.length}\r\n`,{flag:'a'})
    try {
        if (fileStack.length < 1) {
            throw 'Nothing left on the file stack'
        }
        let removed = fileStack.pop()
        fs.writeFileSync(LOG_FILE,`FileStack removed ${JSON.stringify(removed)}\r\n`,{flag:'a'})
        fs.writeFileSync(LOG_FILE,`- PopWriter popped ${fileStack.length}\r\n`,{flag:'a'})
        if (typeof removed.number == 'number') {
            fs.closeSync(removed.number);
        }
        let top: {number:number|undefined, filename:string}
        if (fileStack.length > 0) {
            top = _.last(fileStack);
            let file:number|undefined;
            try {
                file = fs.openSync(top.filename,'a')
                fs.writeFileSync(LOG_FILE,`: TopWriter is ${file} ${top.filename}\r\n`,{flag:'a'})
                process.stdout.write = FileWriter.bind(this,originalStdOutWrite,process.stdout,file,top.filename);
                process.stderr.write = FileWriter.bind(this,originalStdErrWrite,process.stderr,file,top.filename);
                (<any>process.stdout.write).easyName = top.filename;
                (<any>process.stderr.write).easyName = top.filename;
            } catch {
                file = undefined;
            } finally {
                top.number = file;
            }
    
        } else {
            fs.writeFileSync(LOG_FILE,`- PopWriter restored STDIO\r\n`,{flag:'a'})

            process.stdout.write = originalStdOutWrite
            process.stderr.write = originalStdErrWrite
        }
        return removed?.relativePath
            
    } catch (e) {
        logger.error("Bad 4")
        logger.error(e)
        process.kill(process.pid)
        throw e
    }
}

interface TestCleanup {
    _evidenceFilename: string
    _doTestPromise: Promise<"PASSED"|"SKIPPED"|"FAILED">
}

const testCleanupQueue:TestCleanup[] = [];

export const QueueTestCleanup = (c:TestCleanup) => {
    if (c._evidenceFilename) {
    testCleanupQueue.push(c)
}
}

export const ExecuteTestCleanup = async (env:E2ETestEnvironment) => {
    logger.debug("Environment test case cleanup")

    // remove duplicates by:
    // group by _evidenceFilename
    // take the promise for the first in the group.
    // if any of the promises in the group are not identical to the first, throw.
    // map the group to the first

    let groups = Object.values(_.groupBy(testCleanupQueue,'_evidenceFilename'))
    let unique = _.map(groups, g => {
        let first = _.first(g)
        for (let subsequent of g) {
            if (subsequent._doTestPromise !== first._doTestPromise) {
                throw "Cannot have different test results for the same _evidenceFilename"
            }
        }
        return first;
    })

    while (unique.length > 0) {
        let testState:"PASSED"|"SKIPPED"|"FAILED";
        let task = unique.shift()


        try {
            let result = await task._doTestPromise
            if (result === "SKIPPED") {
                testState = "SKIPPED"
            } else {
                testState = "PASSED"
            }
        } catch (e) {
            if (/^(a)?sync skip$/.test(e?.message)) {
                testState = "SKIPPED"                
            } else {
                testState = "FAILED"
            }
        } finally {
            fs.writeFileSync(task._evidenceFilename,"\r\n===================\r\nTEST STATE: "+testState+"\r\n",{flag:'a'})
    
            if (task._evidenceFilename) {
                try {
                    fs.renameSync(task._evidenceFilename, task._evidenceFilename.substr(0,task._evidenceFilename.length - 4) + " " + testState + ".txt")
                }
                finally {
                    
                }
            }
        }

    }

    if (env.Config.EvidenceDir) {
        fs.renameSync(
            path.resolve(env.Config.EvidenceDir,'.work'),
            path.resolve(env.Config.EvidenceDir,moment().format('YYYY-MM-DD HHmm ss'))
        )
    }
}