import "reflect-metadata"

import { RegisterDependencies } from "./Dependencies";
import { AdrGateway } from "./server"
import { ArgumentParser } from "argparse";
import winston = require("winston");
import { container } from "../AdrGwContainer";
import fs from "fs"
import { AdrGatewayConfig, GetBackendConfig } from "../Config";
import { AdrGatewayStartup } from "./startup";

let parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Start adr-gateway'
});


let args = parser.parseArgs();



try {
  let config = GetBackendConfig();
  AdrGatewayStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}



