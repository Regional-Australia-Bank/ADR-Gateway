import {httpsOverHttp,httpOverHttp,httpsOverHttps,httpOverHttps,HttpsOverHttpOptions} from "tunnel"
import axios from "axios"
import _ from "lodash"
import {Agent as httpAgent}  from "http"
import https from "https"
import URLParse from "url-parse"
import tls from "tls"

interface MtlsOptions {
    ca?: any,
    cert?: any,
    key?: any,
    passphrase?: any
}

const tunnels:{config?:MtlsOptions, agents:{http:httpAgent,https:httpAgent}}[] = []
const localAgents:{config?:MtlsOptions, agents:{https:httpAgent}}[] = []

const shallNotProxy = (url:URLParse) => {
    const noProxyHostExp = process.env.NO_PROXY_HOST_EXP || 'localhost|127.0.0.1';
    return (RegExp(noProxyHostExp).test(url.hostname)) 
}

const getProxyOptions = () => {
    const proxyAddr = process.env.ADR_REQUEST_PROXY;
    if (!proxyAddr) return;
    let proxyUrl = URLParse(proxyAddr);
    return proxyUrl;
}

const createTunnelAgents = (proxy:URLParse,mtls?:HttpsOverHttpOptions) => {
    let match = _.find(tunnels,t => t.config?.ca == mtls?.ca && t.config?.key == mtls?.key && t.config?.cert == mtls?.cert && t.config?.passphrase == mtls)
    if (match) return match.agents;

    let https: httpAgent;
    let http: httpAgent;

    if (proxy.protocol === "https") {
        https = httpsOverHttps(<any>{
            proxy: {
                host: proxy.hostname,
                port: parseInt(proxy.port || "3128"),
                headers: {},
            },
            key: mtls?.key,
            cert: mtls?.cert,
            ca: mtls?.ca,        
        });
        http = httpOverHttps(<any>{
            proxy: {
                host: proxy.hostname,
                port: parseInt(proxy.port || "3128"),
                headers: {},
            },
            key: mtls?.key,
            cert: mtls?.cert,
            ca: mtls?.ca,        
        });
    } else {
        https = httpsOverHttp(<any>{
            proxy: {
                host: proxy.hostname,
                port: parseInt(proxy.port || "3128"),
                headers: {},
            },
            key: mtls?.key,
            cert: mtls?.cert,
            ca: mtls?.ca,        
        });
        http = httpOverHttp(<any>{
            proxy: {
                host: proxy.hostname,
                port: parseInt(proxy.port || "3128"),
                headers: {},
            },
            key: mtls?.key,
            cert: mtls?.cert,
            ca: mtls?.ca,        
        });
    }


    tunnels.push({config:mtls,agents:{https,http}})
    return {https,http};
}

const createLocalHttpsAgent = (mtls?:MtlsOptions) => {
    let match = _.find(localAgents,t => t.config?.ca == mtls?.ca && t.config?.key == mtls?.key && t.config?.cert == mtls?.cert && t.config?.passphrase == mtls?.passphrase)
    if (match) return match.agents.https;

    const localHttpsAgent = new https.Agent(_.merge({
    },mtls || {}))
    
    localAgents.push({config:mtls,agents:{https:localHttpsAgent}})
    return localHttpsAgent;
}


const axiosClient = (() => {
    let defaultOptions = {
        proxy: false,
        timeout: parseInt(process.env.REQUEST_TIMEOUT || "0"),
        httpsAgent: createLocalHttpsAgent(),
    };
    let client = axios.create(<any>defaultOptions)

    client.interceptors.response.use(response => response,error => {
        if ((!error) || (!error.toJSON)) throw error;
        let toj = error.toJSON
        error.toJSON = () => {
            let r = toj.call(error);
            r.isAxiosError = true;
            r.response = error?.response
            return r;
        }
        throw error
    })

    client.interceptors.request.use(config => {
        // use the https proxy for non-localhost addresses
        let mtlsConfig = <MtlsOptions>_.pick(config.httpsAgent.options,'ca','cert','key');

        if (mtlsConfig.key && mtlsConfig.cert) {
            // Do not trust tls.rootCertificates
        } else {
            // Add tls.rootCertificates to the ca bundle
            mtlsConfig.ca = _.filter(_.concat(mtlsConfig.ca,tls.rootCertificates))
            // Update the original agent
            config.httpsAgent.options.ca = mtlsConfig.ca;
        }

        let url = URLParse(config.url)
        if (shallNotProxy(url)) return config;


        let proxyOptions = getProxyOptions();
        if (!proxyOptions) return config;
        
        // Create a proxy tunnel and return the respective agents
        let {http,https} = createTunnelAgents(proxyOptions,mtlsConfig);
        config.httpAgent = http;
        config.httpsAgent = https;

        return config;

    })
    return client;
})()

export {axiosClient as axios}
