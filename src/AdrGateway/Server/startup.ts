import { RegisterDependencies } from "./Dependencies";
import { container } from "../AdrGwContainer";
import winston = require("winston");
import { Connection } from "typeorm";
import { AdrGateway } from "./server";
import { AdrGatewayConfig } from "../Config";

export namespace AdrGatewayStartup {
  export async function Start (configFn:() => Promise<AdrGatewayConfig>,db?:Promise<Connection>) {
    const config = await configFn()
    try {
      await RegisterDependencies(configFn,db);
    } catch (err) {
      console.error(err);
      throw 'Configuring application failed during RegisterDependencies. Please ensure the environment is correctly set up. Try node util/server-init.js -h';
    }
  
    let port = config.Port

    let app = container.resolve(AdrGateway).init();
    let logger = <winston.Logger>container.resolve("Logger");
  
    return {port,connectivity:app.connector,server:app.listen(port,() => {
      logger.info( `adr-gateway started at http://localhost:${ port }` );
    })}
  }
}

