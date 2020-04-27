import request = require("request");
import { singleton, injectable } from "tsyringe";
import fs from "fs"
import { AxiosRequestConfig } from "axios";
import https from "https"
import _ from "lodash"
import { CertsFromFilesOrStrings } from "../../Common/SecurityProfile/Util";

interface ClientCertificateInjector {
    inject(options: AxiosRequestConfig):AxiosRequestConfig
}

class DevClientCertificateInjector implements ClientCertificateInjector{
    inject = (options: AxiosRequestConfig):AxiosRequestConfig => {
        if (typeof options.headers == 'undefined') options.headers = {}
        options.headers["x-cdrgw-cert-thumbprint"] = "CERT_THUMBPRINT"
        return options;
    }
}

@injectable()
class DefaultClientCertificateInjector implements ClientCertificateInjector{
    key:Buffer;
    cert:Buffer|Buffer[];
    ca:Buffer;
    passphrase:string|undefined;
    
    constructor(options:{key:string, cert:string|string[],ca: string, passphrase?:string}) {
        this.key = CertsFromFilesOrStrings(options.key);
        this.cert = CertsFromFilesOrStrings(options.cert);
        this.ca = CertsFromFilesOrStrings(options.ca);
        this.passphrase = options.passphrase;
    }

    inject = (options: AxiosRequestConfig):AxiosRequestConfig => {

        options.httpsAgent = new https.Agent({
            cert: this.cert,
            key: this.key,
            ca: this.ca,
            passphrase: this.passphrase,
            rejectUnauthorized: false // TODO from env
        })        
        return options;
    }
}


export {ClientCertificateInjector, DevClientCertificateInjector, DefaultClientCertificateInjector}