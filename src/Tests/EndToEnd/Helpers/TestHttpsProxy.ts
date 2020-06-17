import { spawnHttpsProxy } from "../../../HttpsProxy/proxy"
const getPort = require('get-port')
import uuid from "uuid";
import { Dictionary } from "../../../Common/Server/Types";
import { ProxySpec } from "../../../HttpsProxy/Config";

export class TestHttpsProxy {
    static Start = async (params:{port:number},mtlsConfig:{key:Buffer,cert:Buffer|Buffer[],ca:Buffer,requestCert:boolean}) => {
        let name = `TestHttpsProxy-${uuid.v4()}`
        let c:{ProxyConfig:Dictionary<ProxySpec>} = {
            ProxyConfig: {}
        }

        let listeningPort = await getPort();
        c.ProxyConfig[name] = {
            listeningPort,
            target:params.port
        }
        let server = spawnHttpsProxy(c,mtlsConfig,name,listeningPort,params.port)
        return {port:listeningPort, server};
    }
}