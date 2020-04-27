import {httpsOverHttp} from "tunnel"
import axios from "axios"
import _ from "lodash"
import {Agent} from "http"
import https from "https"

interface MtlsOptions {
    ca?: any,
    cert?: any,
    key?: any,
    passphrase?: any
}

const tunnels:{config?:MtlsOptions, agent:Agent}[] = []
const localHttpsAgents:{config?:MtlsOptions, agent:Agent}[] = []

const createTunnel = (mtls?:MtlsOptions) => {
    let match = _.find(tunnels,t => t.config?.ca == mtls?.ca && t.config?.key == mtls?.key && t.config?.cert == mtls?.cert && t.config?.passphrase == mtls?.passphrase)
    if (match) return match.agent;

    let config:any = {
        key: mtls?.key,
        cert: mtls?.cert,
        ca: mtls?.ca,
        passphrase: mtls?.passphrase
    }

    if (process.env.PROXY_URI) {
        let proxy = {
            host: process.env.PROXY_URI, // TODO from process.env
            port: parseInt(process.env.PROXY_PORT || "8080"), // TODO from process.env
            headers: {},
        };
        config.proxy = proxy;
    }

    const tunnel = httpsOverHttp();
    tunnels.push({config:mtls,agent:tunnel})
    return tunnel;
}

const createLocalAgent = (mtls?:MtlsOptions) => {
    let match = _.find(localHttpsAgents,t => t.config?.ca == mtls?.ca && t.config?.key == mtls?.key && t.config?.cert == mtls?.cert && t.config?.passphrase == mtls?.passphrase)
    if (match) return match.agent;

    const localHttpsAgent = new https.Agent(_.merge({
        rejectUnauthorized: false // TODO move to config
    },mtls || {}))
    
    localHttpsAgents.push({config:mtls,agent:localHttpsAgent})
    return localHttpsAgent;
}


const axiosClient = (() => {
    let options = {
        proxy: false,
        httpsAgent: createTunnel(),
        rejectUnauthorized: false // TODO make configurable,
    };
    let client = axios.create(<any>options)
    client.interceptors.request.use(config => {
        // use the https proxy for non-localhost addresses
        let mtlsConfig = <MtlsOptions>_.pick(config.httpsAgent.options,'ca','cert','key');
        if (!((!config.url) || /^https:\/\/(localhost|127.0.0.1)/.test(config.url))) {
            config.httpsAgent = createTunnel(mtlsConfig);    
        } else {
            config.httpsAgent = createLocalAgent(mtlsConfig);
        }
        return config;
    })
    return client;
})()

export {axiosClient as axios}
