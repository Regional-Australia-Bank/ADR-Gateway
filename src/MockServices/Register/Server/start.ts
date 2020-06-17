import "reflect-metadata"

import { ArgumentParser } from "argparse";
import winston = require("winston");
import { MockRegisterServerStartup } from "./startup";
import { GetConfig } from "./Config";


let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-gateway'
});

let args = parser.parseArgs();

let config = GetConfig();
let configFn = () => Promise.resolve(config)

let clientProvider = async (clientId:string) => {
  return Promise.resolve({
    clientId,
    jwksUri: config.TestDataRecipientJwksUri
  })
}

let server = MockRegisterServerStartup.Start(configFn,clientProvider).catch(reason => {console.error(reason)
})


