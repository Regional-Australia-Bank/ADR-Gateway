import "reflect-metadata"
import { GetConfig } from "./Config";
import { AdrJwksStartup } from "./startup";

const config = GetConfig()
try {
  AdrJwksStartup.Start(() => Promise.resolve(config))
} catch (reason) {
  console.error(reason)
}