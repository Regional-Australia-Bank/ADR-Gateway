import { RegisterDependencies } from "./Dependencies";
import { container } from "../AdrDiContainer";
import winston = require("winston");
import { Connection } from "typeorm";
import { AdrServer } from "./server";
import { Server } from "http";
import { AdrServerConfig } from "./Config";

export namespace AdrServerStartup {
  export async function Start (configFn:() => Promise<AdrServerConfig>,db?:Promise<Connection>) {
    const config = await configFn()
    try {
      await RegisterDependencies(configFn,db);
    } catch (err) {
      console.error(err);
      throw 'Configuring application failed during RegisterDependencies. Please ensure the environment is correctly set up. Try node util/server-init.js -h';
    }
  
    let port = config.Port

    let app = container.resolve(AdrServer).init();
    let logger = <winston.Logger>container.resolve("Logger");
  
    return {port,server:app.listen(port,() => {
      logger.info( `adr-server started at http://localhost:${ port }` );
    })}
  }
}

