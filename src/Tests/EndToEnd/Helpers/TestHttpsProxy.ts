import { spawnHttpsProxy } from "../../../HttpsProxy/proxy"
const getPort = require('get-port')

export class TestHttpsProxy {
    static Start = async (params:{port:number},mtlsConfig:{key:Buffer,cert:Buffer|Buffer[],ca:Buffer,requestCert:boolean}) => {
        let httpsPort = await getPort();
        let server = spawnHttpsProxy(Symbol.name,httpsPort,params.port,mtlsConfig)
        return {port:httpsPort, server};
    }
}