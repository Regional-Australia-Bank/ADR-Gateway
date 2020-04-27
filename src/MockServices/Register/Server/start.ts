import "reflect-metadata"

import { MockRegister } from "./server"
import { ArgumentParser } from "argparse";
import winston = require("winston");
import { MockRegisterServerStartup } from "./startup";
import { GetConfig } from "./Config";


let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-gateway'
});
parser.addArgument(
  [ '-d' ],
  {
    help: 'Directory which contains the server environment, including configuration files e.g. local-env',
    dest: "directory"
  }
);

let args = parser.parseArgs();

process.chdir(args.directory)


let server = MockRegisterServerStartup.Start(
  () => Promise.resolve(GetConfig()),
  (clientId:string) => Promise.resolve({
    clientId,
    jwksUri: "http://localhost:8101/jwks"      
  })).catch(reason => {console.error(reason)
})


