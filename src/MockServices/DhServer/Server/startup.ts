import { RegisterDependencies } from "./Dependencies";
import { DhServer } from "./server";
import { container } from "../DhDiContainer";
import { DhServerConfig } from "./Config";
import { Connection } from "typeorm";
import winston = require("winston");

export namespace DhServerStartup {
    export async function Start (configFn:() => Promise<DhServerConfig>) {
      const config = await configFn()

      try {
        await RegisterDependencies(configFn);
      } catch (err) {
        throw (err)
      }
    
      let port = config.Port
      
      let server = container.resolve(DhServer)
      let app = await server.init();
      let logger = <winston.Logger>container.resolve("Logger");

      return {port,connectivity:app.pw,server:app.listen(port,() => {
        logger.info( `dh-server started at http://localhost:${ port }` );
      })}

    
    }
  }
  
  