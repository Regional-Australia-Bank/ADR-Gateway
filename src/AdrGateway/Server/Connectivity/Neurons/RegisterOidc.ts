import { AdrConnectivityConfig } from "../../../Config";
import { injectable } from "tsyringe";
import {Length, IsUrl, MinLength, validate} from "class-validator";
import _ from "lodash"
import { DefaultCacheFactory } from "../Cache/DefaultCacheFactory";
import { JWKS } from "jose";
import uuid from "uuid";
import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { axios } from "../../../../Common/Axios/axios";

const GetRegisterOIDC = async (cert:ClientCertificateInjector,config:AdrConnectivityConfig):Promise<RegisterOidcResponse> => {
    let url = config.RegisterBaseUris.Oidc + "/.well-known/openid-configuration";

    let oidcData = new Promise((resolve,reject) => {
        axios.get(url, cert.injectCa({responseType: "json", timeout: 10000})).then(res => { // TODO configure timeout value
            resolve(res.data)
        },err => {
            reject(err)
        })
    })

    return new RegisterOidcResponse(await oidcData);
}

@injectable()
export class RegisterOidcNeuron extends Neuron<AdrConnectivityConfig,RegisterOidcResponse> {
    constructor(private cert:ClientCertificateInjector) {
        super()
        this.cache = DefaultCacheFactory.Generate("RegisterOidcNeuron"); // Use generic cache for the moment
        this.AddValidator(async (o) => {
            if (typeof o == 'undefined') {
                throw 'Unexpected undefined value from cache'
            }
            const errors = await validate(o)
            if (errors.length > 0) throw errors;
            return true;
        });

        (<any>this).marker2 = uuid.v4();
        (<any>this).marker = "RegisterTokeNueron";
        
    }

    evaluator = GetRegisterOIDC.bind(undefined,this.cert);
}

export class RegisterOidcResponse {
    @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
    token_endpoint!: string;

    @IsUrl({require_tld:false})
    jwks_uri!: string;

    @IsUrl({require_tld:false})
    issuer!: string;

    constructor(data:any) {
        if (typeof data != 'object') throw 'Contructor input must be an object';
        this.issuer = data.issuer;
        this.jwks_uri = data.jwks_uri;
        this.token_endpoint = data.token_endpoint;
    }
}

