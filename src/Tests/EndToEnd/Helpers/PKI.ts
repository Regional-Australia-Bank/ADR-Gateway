import forge from "node-forge"
import _ from "lodash"
import { attrArrayMap, createCertificate } from "./PKI.util";
import uuid from "uuid";

let PKI = forge.pki
let rsa = forge.pki.rsa

let testConfig: Promise<{
    client: KeyAndCert;
    server: KeyAndCert;
    caCert: string;
}>;

let testConfigInvalid: Promise<{
    client: KeyAndCert;
    server: KeyAndCert;
    caCert: string;
}>;

export class TestPKI {
    private static NewCA = async ():Promise<CertificateAuthority> => {
        return new CertificateAuthority()
    }

    static TestConfig = ():(typeof testConfig) => {
        if (!testConfig) {
            testConfig = new Promise(async (resolve,reject) => {
                try {
                    const ca = await TestPKI.NewCA();
                    let testConfig = {
                        client: await ca.ClientPair(),
                        server: await ca.ServerPair(),
                        caCert: ca.ca_cert_pem
                    }
                    return resolve(testConfig);
        
                } catch (e) {
                    reject(e)
                }
            })
        }
        return testConfig
    }

    static TestConfigInvalid = ():(typeof testConfigInvalid) => {
        if (!testConfigInvalid) {
            testConfigInvalid = new Promise(async (resolve,reject) => {
                try {
                    const ca = await TestPKI.NewCA(); // New CA different from the "Valid" one
                    let testConfigInvalid = {
                        client: await ca.ClientPair(),
                        server: await ca.ServerPair(),
                        caCert: ca.ca_cert_pem
                    }
                    return resolve(testConfigInvalid);
        
                } catch (e) {
                    reject(e)
                }
            })
        }
        return testConfigInvalid
    }

}

export interface KeyAndCert {
    key: string
    certChain: string|string[]
}

class CertificateAuthority {
    ca_keypair: forge.pki.rsa.KeyPair
    ca_attrs: ReturnType<typeof attrArrayMap>;
    ca_cert_pem:string;

    constructor () {
        this.ca_keypair = rsa.generateKeyPair({bits: 2048, e: 0x10001});
        this.ca_attrs = attrArrayMap({
            commonName: "Mock Register CA",
            countryName: "Australia",
            ST: "NSW",
            localityName: "Armidale",
            organizationName: "Mock Register"
        })

        let ca_cert = createCertificate({
            publicKey: this.ca_keypair.publicKey,
            signingKey: this.ca_keypair.privateKey,
            extensions: [{
              name: 'authorityKeyIdentifier',
              keyIdentifier: true,
              authorityCertIssuer: true,
            }],
            subject: this.ca_attrs,
            issuer: this.ca_attrs,
            isCA: true
        });

        this.ca_cert_pem = PKI.certificateToPem(ca_cert)

    }


    ServerPair = async ():Promise<KeyAndCert> => {
        let server_keypair = rsa.generateKeyPair({bits: 2048, e: 0x10001});

        let server_attrs = attrArrayMap({
            commonName: "localhost",
            countryName: "Australia",
            ST: "NSW",
            localityName: "Armidale",
            organizationName: "Data Holder"
        })

        let server_cert = createCertificate({
          publicKey: server_keypair.publicKey,
          signingKey: this.ca_keypair.privateKey,
          subject: server_attrs,
          issuer: this.ca_attrs,
          isCA: false,
          altNames: [{
            type: 2,
            value: 'localhost'
          }]
        });

        let key = PKI.privateKeyToPem(server_keypair.privateKey);
        let server_cert_pem = PKI.certificateToPem(server_cert);
        let certChain = [server_cert_pem].join("\n")

        return {
            key,
            certChain
        }
      
    }

    ClientPair = async ():Promise<KeyAndCert> => {
        let client_keypair = rsa.generateKeyPair({bits: 2048, e: 0x10001});

        let server_attrs = attrArrayMap({
            commonName: "localhost",
            countryName: "Australia",
            ST: "NSW",
            localityName: "Armidale",
            organizationName: "Data Recipient"
        })

        let server_cert = createCertificate({
          publicKey: client_keypair.publicKey,
          signingKey: this.ca_keypair.privateKey,
          subject: server_attrs,
          issuer: this.ca_attrs,
          isCA: false
        });

        let key = PKI.privateKeyToPem(client_keypair.privateKey);
        let server_cert_pem = PKI.certificateToPem(server_cert);
        let certChain = [server_cert_pem].join("\n")

        return {
            key,
            certChain
        }
    }

}