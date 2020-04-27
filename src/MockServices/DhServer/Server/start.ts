import "reflect-metadata"


import { DhServer } from "./server"
import { ArgumentParser } from "argparse";

import fs from "fs"
import { DhServerConfig } from "./Config";
import { RegisterDependencies } from "./Dependencies";
import { DhServerStartup } from "./startup";

const port = process.env.PORT || 8201;

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'Start dh-server'
});
parser.addArgument(
  ['-d'],
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

let config = <DhServerConfig>JSON.parse(fs.readFileSync("config.json").toString());

config.Port = parseInt(process.env.PORT || "") || config.Port || 8201
try {
  DhServerStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}


