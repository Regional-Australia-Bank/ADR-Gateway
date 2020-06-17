import "reflect-metadata"

import { AdrServerStartup } from "./startup";
import { GetConfig } from "./Config";

try {
  AdrServerStartup.Start(GetConfig)
} catch (reason) {
  console.error(reason)
}