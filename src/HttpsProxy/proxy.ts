import http from "http"
import https from "https"
import tls from "tls"

var httpProxy = require('http-proxy');
var path = require('path');
const homedir = require('os').homedir();
const util = require('util');
const fs = require('fs')
var selfsigned = require('selfsigned');
const express = require('express');
const basicAuth = require('express-basic-auth');


export const spawnHttpsProxy = (name:string,httpsPort:number,httpPort:number,mtlsConfig:{key:Buffer,cert:Buffer|Buffer[],ca:Buffer,requestCert:boolean},options?:any) => {
  const app = express()

  let proxy = httpProxy.createProxyServer({
    target: {
      host: 'localhost',
      port: httpPort
    },
    xfwd: true
  });

  let basicAuthConfig = options && options.users && options
  const basicAuthMiddleware = (basicAuthConfig && basicAuth(basicAuthConfig)) || []
  
  const proxyMiddleware = (req:any, res:any) => {
	  
	  res.setHeader('Access-Control-Allow-Origin', '*');
	  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, PUT');
	  res.setHeader('Access-Control-Allow-Headers', '*');
	    
      proxy.web(req, res, { target: `http://127.0.0.1:${httpPort}` });
  }

  app.use(
    (req:http.IncomingMessage, res:any, next:any) => {
	  //console.log({method:req.method,url:req.url,headers:req.headers});

    if (mtlsConfig) {
      delete req.headers['x-cdrgw-cert-thumbprint'];
      if (req.socket && req.socket instanceof tls.TLSSocket) {
        let cert = req.socket.getPeerCertificate();
        if (cert.fingerprint) {
          req.headers['x-cdrgw-cert-thumbprint'] = cert?.fingerprint;
        }
        console.log(cert)
      }
    }

	  if (typeof basicAuthMiddleware == 'function') {
        if (options.noAuthPattern) {
          const methodUrlString = req.method.toUpperCase()+" "+req.url;
          console.log(methodUrlString)
          if (!options.noAuthPattern.test(methodUrlString)) {
            return basicAuthMiddleware(req,res,next)
          }
        }
      }
      next();
    },
    proxyMiddleware
  )

  console.log(`Proxy server ca: ${mtlsConfig.ca.toString()}`)

  let serverOpts = (mtlsConfig && {
    key: mtlsConfig.key,
    cert: mtlsConfig.cert,
    // ca: mtlsConfig.ca, 
    requestCert: mtlsConfig.requestCert, 
    rejectUnauthorized: false // TODO return to true
  }) || {}

  return https.createServer(serverOpts,app).listen(httpsPort, () => console.log(`${name} listening on HTTPS port ${httpsPort}!`))
}
