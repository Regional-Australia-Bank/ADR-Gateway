import { AdrJwksConfig } from "./Config";
import { AdrJwks } from "./server";

export namespace AdrJwksStartup {
  export async function Start (configFn:() => Promise<AdrJwksConfig>) {
    const config = await configFn()
  
    let port = config.Port

    let app = new AdrJwks(config).init();
  
    return {port,server:app.listen(port,() => {
      console.info( `adr-jwks started at http://localhost:${ port }` );
    })}
  }
}

