import "reflect-metadata"

import { ArgumentParser } from "argparse";
import fs from "fs"
import { AdrServerStartup } from "./startup";
import { GetConfig } from "./Config";

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-server'
});

let args = parser.parseArgs();

try {
  AdrServerStartup.Start(GetConfig)
} catch (reason) {
  console.error(reason)
}