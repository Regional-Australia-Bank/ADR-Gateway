import "reflect-metadata"


import { DhServer } from "./server"
import { ArgumentParser } from "argparse";

import fs from "fs"
import { DhServerConfig, GetConfig } from "./Config";
import { RegisterDependencies } from "./Dependencies";
import { DhServerStartup } from "./startup";

const port = process.env.PORT || 8201;

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'Start dh-server'
});

let args = parser.parseArgs();

let config = GetConfig();

try {
  DhServerStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}


