import "reflect-metadata"

import { RegisterDependencies } from "../Server/Dependencies";
import winston = require("winston");
import { container } from "../AdrGwContainer";
import { AdrHousekeeper } from "./worker";
import fs from 'fs'
import { GetHousekeeperConfig } from "../Config";

async function doStartup () {

  try {
    await RegisterDependencies(GetHousekeeperConfig); // TODO remove the any cheat
  } catch (err) {
    winston.error(err);
    throw 'Configuring application failed during RegisterDependencies. Please ensure the environment is correctly set up. Try node util/server-init.js -h';
  }

  let worker = container.resolve(AdrHousekeeper).init();
}


doStartup()
.then(() => {})
.catch(reason => {console.error(reason)});


