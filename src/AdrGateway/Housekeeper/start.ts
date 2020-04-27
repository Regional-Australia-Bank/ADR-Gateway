import "reflect-metadata"

import { RegisterDependencies } from "../Server/Dependencies";
import { ArgumentParser } from "argparse";
import winston = require("winston");
import { container } from "../AdrGwContainer";
import { AdrHousekeeper } from "./worker";
import fs from 'fs'
import { AdrGatewayConfig } from "../Config";

const port = process.env.PORT || 8102;

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-gateway-housekeeper'
});
parser.addArgument(
  [ '-d' ],
  {
    help: 'Directory which contains the server environment, including configuration files e.g. local-env',
    dest: "directory"
  }
);

let args = parser.parseArgs();

async function doStartup (args:any) {
  let directory:string = args.directory;
  if (typeof directory != 'string') throw `Directory must be a string`;
  try {
      console.log("Changing directory to "+directory);
      process.chdir(directory);
  } catch {
      throw 'Could not change directory. Please ensure the specified path is a directory.'
  }

  let config = <AdrGatewayConfig>JSON.parse(fs.readFileSync("config.json").toString());

  try {
    await RegisterDependencies(() => Promise.resolve(config));
  } catch (err) {
    winston.error(err);
    throw 'Configuring application failed during RegisterDependencies. Please ensure the environment is correctly set up. Try node util/server-init.js -h';
  }

  let worker = container.resolve(AdrHousekeeper).init();
}


doStartup(args)
.then(() => {})
.catch(reason => {console.error(reason)});


