import "reflect-metadata"

import { RegisterDependencies } from "../Server/Dependencies";
import { ArgumentParser } from "argparse";
import winston = require("winston");
import { container } from "../AdrGwContainer";
import { AdrHousekeeper } from "./worker";
import fs from 'fs'
import { AdrGatewayConfig, GetHousekeeperConfig } from "../Config";

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-gateway-housekeeper'
});

let args = parser.parseArgs();

async function doStartup (args:any) {

  try {
    await RegisterDependencies(GetHousekeeperConfig); // TODO remove the any cheat
  } catch (err) {
    winston.error(err);
    throw 'Configuring application failed during RegisterDependencies. Please ensure the environment is correctly set up. Try node util/server-init.js -h';
  }

  let worker = container.resolve(AdrHousekeeper).init();
}


doStartup(args)
.then(() => {})
.catch(reason => {console.error(reason)});


