import "reflect-metadata"

import { MockRegisterServerStartup } from "./startup";
import { GetConfig } from "./Config";

let config = GetConfig();
let configFn = () => Promise.resolve(config)

let clientProvider = async (clientId:string) => {
  return Promise.resolve({
    clientId,
    jwksUri: config.TestDataRecipientJwksUri
  })
}

let server = MockRegisterServerStartup.Start(configFn,clientProvider).catch(reason => {console.error(reason)
})


