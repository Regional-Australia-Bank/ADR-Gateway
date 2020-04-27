import * as fs from "fs"
import { createConnection, Connection } from "typeorm";
// import { ConformingDataProvider, TestConfigCertificateProvider } from "../../Tests/Common/Common.TestData.AdrGw";
import {ArgumentParser} from "argparse"
import { container } from "../AdrGwContainer";
import { ConsentRequestLog } from "../Entities/ConsentRequestLog";
import { GenerateDrJwks } from "../../Common/Init/Jwks";
import { AdrGatewayConfig } from "../Config";
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
    

    let configFile = "config.json"
    let keystore = "adrgw.private.jwks.json"
   
    let config:AdrGatewayConfig = {
        // Some security configuration is probably needed
        Database: {
            // this is in the object format of https://typeorm.io/#/connection
            type: "sqlite",
            database:"local.sql.db"
        },
        Logging: {
            logfile: "log.txt"
        },
        AdrClients: [
            {
                authCallbackUri: "https://localhost:9101/authorize.cb",
                systemId: "system-id"
            }
        ],
        Jwks: keystore,
        DataRecipientApplication: <any>{}, // TODO generate,
        Port: 8101,
        RegisterBaseUris: <any>{},
        BackEndBaseUri: "https://localhost:9101"
    }

    // write config
    console.log("Writing config to "+configFile)
    fs.writeFileSync(configFile,JSON.stringify(config));

    // create database config
    console.log("Writing database to "+config.Database!.database)

    container.register<Promise<Connection>>(
        "Promise<Connection>",
        {
            useValue: createConnection({
                type: "sqlite",
                database: <string>config.Database!.database,
                synchronize: true,
                entityPrefix: process.env.ENTITY_PREFIX || "adr_",
                entities: [ConsentRequestLog]
                })
        });
    
    // const cdp = new ConformingDataProvider();
    // await cdp.init();

    // cdp.init() inserts the client public keys into the database. We'll also output the client-private-key-[client-id].jwks.json

    console.log("Generating keys");
    const myJwks = GenerateDrJwks()

    console.log("Writing keystore to "+keystore)
    fs.writeFileSync(keystore,JSON.stringify(myJwks.toJWKS(true)));

    
}

doInit(args)
.then(() => {console.log("Init done.")})
.catch(reason => {console.error(reason)});

// create own signing keys and public JWKS

// create and populate DB with some test data

