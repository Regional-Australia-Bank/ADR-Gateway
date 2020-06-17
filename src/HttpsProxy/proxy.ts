import http from "http"
import https from "https"
import tls from "tls"
import { MockInfrastructureConfig, ProxySpec, TlsConfig } from "./Config";
import { Dictionary } from "tsyringe/dist/typings/types";

var httpProxy = require('http-proxy');
const express = require('express');
const basicAuth = require('express-basic-auth');


export const spawnHttpsProxy = (config:{ProxyConfig:Dictionary<ProxySpec>},tlsConfig:TlsConfig,name:string,defaultHttpsPort:number,defaultTargetPort:number) => {
  const app = express()

  let proxy = httpProxy.createProxyServer({
    xfwd: true
  });

  const routeConfig = config.ProxyConfig[name];
  let target:string;
  if (typeof routeConfig?.target == 'number') {
    target = `http://localhost:${routeConfig?.target}`
  } else if (typeof routeConfig?.target == 'string') {
    target = routeConfig?.target
  } else {
    target = `http://localhost:${defaultTargetPort}`
  }

  let basicAuthConfig = routeConfig && routeConfig.users && {users:routeConfig.users}
  const basicAuthMiddleware = (basicAuthConfig && basicAuth(basicAuthConfig)) || []
  
  const proxyMiddleware = (req:any, res:any) => {
	  
	  res.setHeader('Access-Control-Allow-Origin', '*');
	  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, PUT');
	  res.setHeader('Access-Control-Allow-Headers', '*');
	    
      proxy.web(req, res, { target });
  }

  app.use(
    (req:http.IncomingMessage, res:any, next:any) => {
	  //console.log({method:req.method,url:req.url,headers:req.headers});

    if (tlsConfig.requestCert) {
      // delete req.headers['x-cdrgw-cert-thumbprint'];
      if (req.socket && req.socket instanceof tls.TLSSocket) {
        let cert = req.socket.getPeerCertificate();
        if (cert.fingerprint) {
          req.headers['x-cdrgw-cert-thumbprint'] = cert?.fingerprint;
        }
        console.log(cert)
      }
    }

	  if (typeof basicAuthMiddleware == 'function') {
        if (routeConfig.noAuthPattern) {
          const methodUrlString = req.method.toUpperCase()+" "+req.url;
          console.log(methodUrlString)
          if (!new RegExp(routeConfig.noAuthPattern).test(methodUrlString)) {
            return basicAuthMiddleware(req,res,next)
          }
        }
      }
      next();
    },
    proxyMiddleware
  )

  let serverOpts = (tlsConfig && {
    key: tlsConfig.key,
    cert: tlsConfig.cert,
    ca: tlsConfig.ca, 
    requestCert: tlsConfig.requestCert
  }) || {}

  let httpsPort = defaultHttpsPort || routeConfig.listeningPort

  return https.createServer(serverOpts,app).listen(httpsPort, () => console.log(`${name} listening on HTTPS port ${httpsPort}!`))
}
