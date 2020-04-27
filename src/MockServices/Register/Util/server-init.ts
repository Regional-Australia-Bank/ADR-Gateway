import * as fs from "fs"
// import { ConformingDataProvider, TestConfigCertificateProvider } from "../../Tests/Common/Common.TestData.AdrGw";
import {ArgumentParser} from "argparse"
import { JWKS, JWK, ECCurve } from "jose";
import { DataHolders } from "../MockData/DataHolders";
import { DataRecipients } from "../MockData/DataRecipients";
// create config file

// local-env will be ignored from .tfignore, so we can put our configuration/db in there

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Initilise local testing config'
});
parser.addArgument(
  [ '-d' ],
  {
    help: 'Directory which should contain the environment e.g. local-env',
    dest: "directory"
  }
);

let args = parser.parseArgs();

async function doInit(args:any):Promise<void> {
    let directory = args.directory;
    if (typeof directory != 'string') throw `Directory must be a string`;
    if (fs.existsSync(directory)) {
        try {
            console.log("Changing directory to "+directory);
            process.chdir(directory);
        } catch {
            throw 'Could not change directory. Please ensure the specified path is a directory.'
        }
    } else {
        try {
            console.log("Creating directory "+directory);
            fs.mkdirSync(directory);
            console.log("Changing directory to "+directory);
            process.chdir(directory);
        } catch {
            throw 'Could not create directory.'
        }
    }
    
    let keystore = "mock-register.private.jwks.json"

    console.log("Generating keys");

    const myJwks = new JWKS.KeyStore([JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' })]);

    console.log("Writing keystore to "+keystore)
    fs.writeFileSync(keystore,JSON.stringify(myJwks.toJWKS(true)));

    console.log("Copying test data")
    fs.writeFileSync("mock.data-recipients.json",JSON.stringify(DataRecipients));
    fs.writeFileSync("mock.data-holders.json",JSON.stringify(DataHolders));

}

doInit(args)
.then(() => {console.log("Init done.")})
.catch(reason => {console.error(reason)});

// create own signing keys and public JWKS

// create and populate DB with some test data

