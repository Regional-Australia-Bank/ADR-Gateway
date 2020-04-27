import "reflect-metadata"

import { RegisterDependencies } from "./Dependencies";
import { AdrGateway } from "./server"
import { ArgumentParser } from "argparse";
import winston = require("winston");
import { container } from "../AdrGwContainer";
import fs from "fs"
import { AdrGatewayConfig } from "../Config";
import { AdrGatewayStartup } from "./startup";

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

let directory:string = args.directory;
if (typeof directory != 'string') throw `Directory must be a string`;
try {
    console.log("Changing directory to "+directory);
    process.chdir(directory);
} catch {
    throw 'Could not change directory. Please ensure the specified path is a directory.'
}

let config = <AdrGatewayConfig>JSON.parse(fs.readFileSync("config.json").toString());

config.Port = parseInt(process.env.PORT || "") || config.Port || 8101
try {
  AdrGatewayStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}



