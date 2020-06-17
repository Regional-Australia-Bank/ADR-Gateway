import "reflect-metadata"

import { GetConfig } from "./Config";
import { MockSoftwareProductServerStartup } from "./startup";

let server = MockSoftwareProductServerStartup.Start(
  () => Promise.resolve(GetConfig())).catch(reason => {console.error(reason)
})


