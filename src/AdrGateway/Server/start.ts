import {loadInstrumentation} from "./Instrumentation"
loadInstrumentation();

import "reflect-metadata"

import { GetBackendConfig } from "../Config";
import { AdrGatewayStartup } from "./startup";

try {
  let config = GetBackendConfig();
  AdrGatewayStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}



