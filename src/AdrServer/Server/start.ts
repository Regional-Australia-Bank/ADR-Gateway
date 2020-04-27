import "reflect-metadata"

import { ArgumentParser } from "argparse";
import fs from "fs"
import { AdrServerStartup } from "./startup";
import { AdrServerConfig } from "./Config";

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-server'
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

const config = <AdrServerConfig>JSON.parse(fs.readFileSync("config.json").toString());
config.Port = parseInt(process.env.PORT || "") || config.Port || 8102
try {
  AdrServerStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}