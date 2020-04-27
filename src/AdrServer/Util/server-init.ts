import * as fs from "fs"
import { createConnection, Connection } from "typeorm";
import { JtiLog } from "../../Common/Entities/JtiLog";
import { ClientJwks } from "../../Common/Entities/ClientJwks";
import { MetadataUpdateLog } from "../../Common/Entities/MetadataUpdateLog";
import { ConformingDataProvider } from "../../Tests/Integration/Common.TestData.Adr";
import { JWKS, JWK } from "jose";
import {ArgumentParser} from "argparse"
import { container } from "../AdrDiContainer";
import winston = require("winston");
import { ConsentRequestLog } from "../../AdrGateway/Entities/ConsentRequestLog";
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
    let keystore = "adr.private.jwks.json"
    
    let config = {
        SecurityProfile: {
            ClientCertificates: {
                Headers:{
                    ThumbprintHeader: "x-cdrgw-cert-thumbprint"
                },
            }
        },
        Database: {
            // this is in the object format of https://typeorm.io/#/connection
            type: "sqlite",
            database:"local.sql.db"
        },
        Logging: {
            logfile: "log.txt"
        }
    }

    // write config
    console.log("Writing config to "+configFile)
    fs.writeFileSync(configFile,JSON.stringify(config));

    container.register("Logger",{useValue:winston.createLogger()});

    // create database config
    console.log("Writing database to "+config.Database.database)
    container.register<Promise<Connection>>(
        "Promise<Connection>",
        {
            useValue: createConnection({
            type: "sqlite",
            database: config.Database.database,
            synchronize: true,
            entityPrefix: process.env.ENTITY_PREFIX || "adr_",
            entities: [JtiLog, ClientJwks, MetadataUpdateLog, ConsentRequestLog]
            })
        });
    
    const cdp = new ConformingDataProvider();
    await cdp.init();

    // cdp.init() inserts the client public keys into the database. We'll also output the client-private-key-[client-id].jwks.json
    for (let [clientId, jwks] of Object.entries(cdp.clients)) {
        let json = JSON.stringify(jwks.toJWKS(true)); // true => private key
        let filename = `client-private-key-${clientId}.jwks.json`;
        console.log("Writing client keystore: "+filename);
        fs.writeFileSync(filename,json);
    }

        
    console.log("Generating keys");
    const myJwks = new JWKS.KeyStore([
        JWK.generateSync('RSA', 2048, { alg: 'PS256', use: 'sig' }),
        JWK.generateSync('RSA', 2048, { alg: 'RSA-OAEP', use: 'enc' }),
    ]);

    console.log("Writing keystore to "+keystore)
    fs.writeFileSync(keystore,JSON.stringify(myJwks.toJWKS(true)));
    
}

doInit(args)
.then(() => {console.log("Init done.")})
.catch(reason => {console.error(reason)});

// create own signing keys and public JWKS

// create and populate DB with some test data

