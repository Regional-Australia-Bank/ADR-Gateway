import "reflect-metadata"

import { MockInfrastructureStartup } from "./startup";
import { GetConfig } from "./Config";

const config = GetConfig()
try {
  MockInfrastructureStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}