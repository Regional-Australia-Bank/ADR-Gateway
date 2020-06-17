import forge from "node-forge"
import _ from "lodash"
import moment from "moment"
const seedrandom = require('seedrandom');

let PKI = forge.pki

export const prng = (seed:string) => {
  let rng = seedrandom(seed, {state: true})
  
  let getBytesSync = (length:number) => {
      let a = [];
      for (let i=0; i < length; i++) {
          a.push(Math.abs(rng.int32()) % 256)
      }
      return {charCodeAt:(i:number) => a[i]};
  }
  return {getBytesSync}
}

export function attrArrayMap (o) {
    return _.map(_.keys(o),k => {
        if (/[A-Z]{2}/.test(k)) {
            return {shortName:k, value: o[k]}
        } else {
            return {name:k, value: o[k]}
        }
    })
}

export function createCertificate(options) {
    var publicKey = options.publicKey;
    var signingKey = options.signingKey;
    var subject = options.subject;
    var issuer = options.issuer;
    var isCA = options.isCA;
    var serialNumber = options.serialNumber || '01';
    var notBefore = moment("2020-01-01T14:00:00+1100").toDate();
    var notAfter = moment("2040-01-01T14:00:00+1100").toDate();

    var cert = PKI.createCertificate();
    cert.publicKey = publicKey;
    cert.serialNumber = serialNumber;
    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;
    cert.setSubject(subject);
    cert.setIssuer(issuer);
    var extensions = options.extensions || [];
    if(isCA) {
      extensions.push({
        name: 'basicConstraints',
        cA: true
      });
    }
    extensions.push({
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    }, {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    }, {
      name: 'subjectAltName',
      altNames: options.altNames || []
    }, {
      name: 'subjectKeyIdentifier'
    });
    // FIXME: add authorityKeyIdentifier extension
    cert.setExtensions(extensions);

    cert.sign(signingKey, forge.md.sha256.create());

    return cert;
  }
  