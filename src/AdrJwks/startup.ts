import { AdrJwksConfig } from "./Config";
import { AdrJwks } from "./server";
import { logger } from "./Logger";

export namespace AdrJwksStartup {
  export async function Start (configFn:() => Promise<AdrJwksConfig>) {
    const config = await configFn()
  
    let port = config.Port

    let app = new AdrJwks(config).init();
  
    return {port,server:app.listen(port,() => {
      logger.info( `adr-jwks started at http://localhost:${ port }` );
    })}
  }
}

