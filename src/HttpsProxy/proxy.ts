import http from "http"
import https from "https"
import tls from "tls"
import { MockInfrastructureConfig, ProxySpec, TlsConfig } from "./Config";
import { Dictionary } from "tsyringe/dist/typings/types";
import { logger } from "../MockServices/MockLogger";

var httpProxy = require('http-proxy');
const express = require('express');
const basicAuth = require('express-basic-auth');

const proxyList = [];

export const spawnHttpsProxy = (config: { ProxyConfig: Dictionary<ProxySpec> }, tlsConfig: TlsConfig, name: string, defaultHttpsPort: number, defaultTargetPort: number) => {
  const app = express()

  let proxy = httpProxy.createProxyServer({
    xfwd: true
  });

  proxyList.push(proxy)

  proxy.on('error', function (err, req, res) {
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
 
    res.end('Something went wrong. And we are reporting a custom error message.');
  });

  const routeConfig = config.ProxyConfig[name];
  let target: string;
  if (typeof routeConfig?.target == 'number') {
    target = `http://localhost:${routeConfig?.target}`
  } else if (typeof routeConfig?.target == 'string') {
    target = routeConfig?.target
  } else {
    target = `http://localhost:${defaultTargetPort}`
  }

  let basicAuthConfig = routeConfig && routeConfig.users && { users: routeConfig.users }

  const basicAuthMiddleware = (basicAuthConfig && basicAuth(basicAuthConfig)) || []

  const proxyMiddleware = (req: any, res: any) => {

    // res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, PUT');
    // res.setHeader('Access-Control-Allow-Headers', '*');

    proxy.web(req, res, { target });
  }

  app.use(
    (req: http.IncomingMessage, res: any, next: any) => {

      if (tlsConfig.requestCert) {
        // delete req.headers['x-cdrgw-cert-thumbprint'];
        if (req.socket && req.socket instanceof tls.TLSSocket) {
          let cert = req.socket.getPeerCertificate();
          if (cert.fingerprint) {
            req.headers['x-cdrgw-cert-thumbprint'] = cert?.fingerprint;
          }
        }
      }

      if (typeof basicAuthMiddleware == 'function') {
        if (routeConfig.noAuthPattern) {
          const methodUrlString = req.method.toUpperCase() + " " + req.url;
          if (!new RegExp(routeConfig.noAuthPattern).test(methodUrlString)) {
            return basicAuthMiddleware(req, res, next)
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

  let server = https.createServer(serverOpts, app).listen(httpsPort, () => logger.info(`${name} listening on HTTPS port ${httpsPort}!`))

  server.on('close', () => {
    for (let proxy of proxyList) {
      proxy.close()
    }
  })

  return server
}
