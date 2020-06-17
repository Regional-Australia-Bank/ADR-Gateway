import "reflect-metadata"


import { GetConfig } from "./Config";
import { DhServerStartup } from "./startup";

let config = GetConfig();

try {
  DhServerStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}


