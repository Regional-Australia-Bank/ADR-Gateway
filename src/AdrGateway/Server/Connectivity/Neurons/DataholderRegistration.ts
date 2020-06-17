import { injectable } from "tsyringe";
import { Neuron, CompoundNeuron } from "../../../../Common/Connectivity/Neuron";
import { DataholderRegisterMetadata } from "./RegisterDataholders";
import { DataHolderRegistrationManager, DataHolderRegistration } from "../../../Entities/DataHolderRegistration";
import { Validator, IsUrl, validate } from "class-validator"
import { AxiosRequestConfig } from "axios";
import { AdrConnectivityConfig, SoftwareProductConnectivityConfig } from "../../../Config";
import moment from "moment";
import uuid from "uuid";
import { JWKS, JWT, JSONWebKeySet } from "jose";
import { AccessToken } from "./RegisterToken";
import _ from "lodash";
import { DefaultCacheFactory, JWKSSerial } from "../Cache/DefaultCacheFactory";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { header } from "express-validator";
import { CreateAssertion } from "../Assertions";
import { EventEmitter } from "events";
import qs from "qs";
import {AxiosResponse} from "axios"
import { axios } from "../../../../Common/Axios/axios";

export const GetAccessToken = async (cert:ClientCertificateInjector, jwks: JWKS.KeyStore, token_endpoint:string, client_id: string): Promise<AccessToken> => {
    let options:AxiosRequestConfig = {
        method: "POST",
        url: token_endpoint,
        responseType: "json",
        data: qs.stringify({
            grant_type: "client_credentials",
            client_assertion: CreateAssertion(client_id,token_endpoint,jwks),
            scope: "cdr:registration",
            client_id: client_id,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
        })
    }
    let response = await axios.request(cert.inject(options));
    return new AccessToken(response.data.access_token,response.data.expires_in);
}


export interface DataholderRegistrationResponse {
    client_id: string,
    software_id: string,
    client_id_issued_at?: number,
    redirect_uris:string[]
    scope:string,
    id_token_encrypted_response_alg:string,
    id_token_encrypted_response_enc:string
}

const NewRegistrationAtDataholder = async (ssa:string,dataholderMeta:DataholderRegisterMetadata,dhOidc:DataholderOidcResponse,config:AdrConnectivityConfig,productConfig:SoftwareProductConnectivityConfig, jwks:JWKS.KeyStore, cert:ClientCertificateInjector):Promise<DataholderRegistrationResponse> => {
    let registrationRequest = RegistrationRequestObject(config,productConfig,dhOidc,ssa)
    let registrationRequestJwt = JWT.sign(registrationRequest,jwks.get({alg:'PS256',use:'sig'}),{header:{typ:"JWT"}})

    let options = cert.inject({method:"POST", url: dhOidc.registration_endpoint, responseType: "json", data: registrationRequestJwt, headers: {"content-type":"application/jwt"}});
    let responseRaw = await axios.request(options)
    let response:DataholderRegistrationResponse = responseRaw.data;

    return response;
}

export const CurrentRegistrationAtDataholder = async (client_id:string,access_token:string,dataholderMeta:DataholderRegisterMetadata,dhOidc:DataholderOidcResponse, cert:ClientCertificateInjector):Promise<DataholderRegistrationResponse> => {

    let response:AxiosResponse<DataholderRegistrationResponse> = await axios.get(dhOidc.registration_endpoint+'/'+client_id,cert.inject({
        responseType: "json",
        headers: {Authorization: `Bearer ${access_token}`}
    }))
    return response.data;
}

export const UpdateRegistrationAtDataholder = async (client_id:string, ssa:string,dhOidc:DataholderOidcResponse,config:AdrConnectivityConfig,productConfig:SoftwareProductConnectivityConfig, jwks:JWKS.KeyStore, accessToken:AccessToken, cert:ClientCertificateInjector):Promise<DataholderRegistrationResponse> => {
    let registrationRequest = RegistrationRequestObject(config,productConfig,dhOidc,ssa)
    let registrationRequestJwt = JWT.sign(registrationRequest,jwks.get({alg:'PS256',use:'sig'}))

    let response = await axios.request(cert.inject({
        method:"PUT",
        url:dhOidc.registration_endpoint+'/'+client_id,
        data:registrationRequestJwt,
        responseType: "json",
        headers: {"content-type":"application/jwt", Authorization: `Bearer ${accessToken.accessToken}`}
    }))

    return response.data;
}


export const DhRegistrationMatchesExpectation = (registration:DataholderRegistrationResponse,config:AdrConnectivityConfig,productConfig:SoftwareProductConnectivityConfig, ssa:string):boolean => {
    // check if configured vs registered redirect_uris are different
    let rUrlDifferenceLeft = _.difference(productConfig.redirect_uris, registration.redirect_uris)
    let rUrlDifferenceRight = _.difference(registration.redirect_uris,productConfig.redirect_uris)
    if (rUrlDifferenceLeft.length > 0 || rUrlDifferenceRight.length > 0) return false;

    if (config.Crypto?.PreferredAlgorithms) {
        let matchedPreferredAlgorithms = false;
        for (let pair of config.Crypto?.PreferredAlgorithms) {
            if (pair.id_token_encrypted_response_alg == registration.id_token_encrypted_response_alg && pair.id_token_encrypted_response_enc == registration.id_token_encrypted_response_enc) {
                matchedPreferredAlgorithms = true;
                break;
            }
        }
        if (!matchedPreferredAlgorithms) return false;
    }

    let ssaParts:{
        org_name?: string,
        scope?: string,
        client_name?: string
        client_description?: string
        client_uri?: string
        redirect_uris?: string
        logo_uri?: string
        tos_uri?: string
        policy_uri?: string
        jwks_uri?: string
        revocation_uri?: string
    } = JWT.decode(ssa)

    const stringPropertieKeys = ['org_name','client_name','client_description','client_uri','logo_uri','tos_uri','policy_uri','jwks_uri','revocation_uri']

    // Check that data holders have the most recent metadata from the register about us

    for (let key of stringPropertieKeys) {
        if (registration[key] !== ssaParts[key]) {
            return false;
        }
    }

    let scopeGap = _.difference(ssaParts.scope.split(" "), registration.scope.split(" "));
    if (scopeGap.length > 0) return false;

    return true;
}

const AgreeCrypto = (config:AdrConnectivityConfig,dhOidc:DataholderOidcResponse) => {

    if (config.Crypto?.PreferredAlgorithms?.length) {
        // Some ordered list of preferred algorithms is provided, so make a choice accordingly
        for (let pair of config.Crypto?.PreferredAlgorithms) {
            if (dhOidc.id_token_encryption_alg_values_supported && (typeof _.find(dhOidc.id_token_encryption_alg_values_supported,alg => alg == pair.id_token_encrypted_response_alg) == 'undefined')) {
                continue
            }
            if (dhOidc.id_token_encryption_enc_values_supported && (typeof _.find(dhOidc.id_token_encryption_enc_values_supported,enc => enc == pair.id_token_encrypted_response_enc) == 'undefined')) {
                continue
            }
            return pair;
        }
    }

    // No list of preferences or no preference match, so choice the first values from the data holder, or our own choice
    return {
        id_token_encrypted_response_alg: (dhOidc.id_token_encryption_alg_values_supported && dhOidc.id_token_encryption_alg_values_supported[0]) || "RSA-OAEP-256",
        id_token_encrypted_response_enc: (dhOidc.id_token_encryption_enc_values_supported && dhOidc.id_token_encryption_enc_values_supported[0]) || "A256CBC-HS512"
    }
    
}

const RegistrationRequestObject = (config:AdrConnectivityConfig,productConfig:SoftwareProductConnectivityConfig,dhOidc:DataholderOidcResponse, ssa:string ) => {

    let crypto = AgreeCrypto(config,dhOidc);

    let o = {
        "iss": productConfig.ProductId,
        "iat": moment().utc().unix(),
        "exp": moment().add(30,'s').utc().unix(), //TODO configurable
        "jti": uuid.v4(),
        "aud": dhOidc.issuer, // As specified https://github.com/cdr-register/register/issues/58
        //"redirect_uris":["http://www.invaliduri.com/callback"],
        "redirect_uris":productConfig.redirect_uris, // TODO reinstate
        "token_endpoint_auth_signing_alg":"PS256",
        "token_endpoint_auth_method":"private_key_jwt",
        "grant_types":[
           "client_credentials",
           "authorization_code",
           "refresh_token",
           //"urn:ietf:params:oauth:grant-type:jwt-bearer" // As specified (https://github.com/cdr-register/register/issues/54)
        ],
        "response_types":["code id_token"],
        "application_type":"web",
        "id_token_signed_response_alg":config.Crypto?.IDTokenSignedResponseAlg || "PS256",
        "id_token_encrypted_response_alg":crypto.id_token_encrypted_response_alg,
        "id_token_encrypted_response_enc":crypto.id_token_encrypted_response_enc,
        "request_object_signing_alg":"PS256",
        "software_statement":ssa
      }

    o.grant_types.push("urn:ietf:params:oauth:grant-type:jwt-bearer") // TODO remove after release 1.1.1 https://github.com/cdr-register/register/issues/54#issuecomment-597368382

    return o;

}

@injectable()
export class CheckAndUpdateClientRegistrationNeuron extends Neuron<[AdrConnectivityConfig,SoftwareProductConnectivityConfig,JWKS.KeyStore,DataholderRegisterMetadata,DataholderOidcResponse,string,DataHolderRegistration,AccessToken],DataHolderRegistration> {
    public static Emitter:EventEmitter = new EventEmitter();
    public static Events = {
        BeforeGetRegistration: Symbol.for('BeforeGetRegistration'),
        GetRegistrationResult: Symbol.for('GetRegistrationResult')
    }

    constructor(dataholderBrandId: string, private registrationManager: DataHolderRegistrationManager, private cert: ClientCertificateInjector) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        this.cache = DefaultCacheFactory.Generate(`CheckAndUpdateClientRegistrationNeuron.${dataholderBrandId}`); // Use generic cache for the moment

    }

    evaluator = async ([
        config,
        productConfig,
        jwks,
        dhRegisterMeta,
        dhOidc,
        ssa,
        regPacket,
        accessToken
    ]:[
        AdrConnectivityConfig,
        SoftwareProductConnectivityConfig,
        JWKS.KeyStore,
        DataholderRegisterMetadata,
        DataholderOidcResponse,
        string,
        DataHolderRegistration,
        AccessToken
    ]) => {

        // TODO This needs some more thought

        let registration = await CurrentRegistrationAtDataholder(regPacket.clientId,accessToken.accessToken,dhRegisterMeta,dhOidc,this.cert)

        let registrationPacket: DataHolderRegistration
        if (!DhRegistrationMatchesExpectation(registration,config,productConfig,ssa)) {
            let response = await UpdateRegistrationAtDataholder(registration.client_id,ssa,dhOidc,config,productConfig,jwks,accessToken,this.cert);
            registrationPacket = await this.registrationManager.UpdateRegistration(response,dhRegisterMeta.dataHolderBrandId)
            return registrationPacket;
        } else {
            return regPacket;
        }

    }
}


export const GetDataHolderOidcNeuron = (dataholderBrandId:string, cert:ClientCertificateInjector) => Neuron.CreateSimple<DataholderRegisterMetadata,DataholderOidcResponse>(async (dhRegisterMeta:DataholderRegisterMetadata) => {
    let url = dhRegisterMeta.endpointDetail.infosecBaseUri + "/.well-known/openid-configuration";
   
    let oidcData = new Promise((resolve,reject) => {
        axios.get(url, cert.injectCa({responseType:"json", timeout: 10000})).then(value => { // TODO configure timeout value
            resolve(value.data)
        },err => {
            reject(err)
        })
    })

    return new DataholderOidcResponse(await oidcData);
})
.WithCache(DefaultCacheFactory.Generate(`GetDataHolderOidcNeuron.${dataholderBrandId}`))
.AddValidator(async (oidc:DataholderOidcResponse) => {
    let errors = await validate(oidc)
    if (errors.length > 0) throw errors; // TODO standardize Validate errors
    return true;
})

export const GetDataHolderJwksNeuron = (dataholderBrandId:string,cert:ClientCertificateInjector) => Neuron.CreateSimple<DataholderOidcResponse,JWKS.KeyStore>(async (dhOidc:DataholderOidcResponse) => {
    let url = dhOidc.jwks_uri;

    let jwksObj = new Promise<JSONWebKeySet>((resolve,reject) => {
        axios.get(url,cert.injectCa({responseType:"json", timeout: 10000})).then(value => { // TODO configure timeout value
            resolve(value.data)
        },err => {
            reject(err)
        })
    })

    return JWKS.asKeyStore(await jwksObj)
})
.WithCache(DefaultCacheFactory.Generate(`GetDataHolderJwksNeuron.${dataholderBrandId}`,JWKSSerial))
.AddValidator(async (jwks:JWKS.KeyStore) => {
    jwks.get({alg:'PS256'})
    return true;
})

export const GetDataHolderJwksFromRegisterNeuron = (dataholderBrandId:string) => Neuron.CreateSimple<DataholderRegisterMetadata,JWKS.KeyStore>(async (dhmeta:DataholderRegisterMetadata) => {
    let jwksEndpoints = _.map(_.filter(dhmeta.authDetails, d => d.registerUType == "SIGNED-JWT"),d => d.jwksEndpoint);

    let jwksObjs = await Promise.all(_.map(jwksEndpoints, url => new Promise<JSONWebKeySet>((resolve,reject) => {
        axios.get(url,{responseType:"json", timeout: 10000}).then(value => { // TODO configure timeout value
            resolve(value.data)
        },err => {
            reject(err)
        })
    })))

    let aggregated = {keys:_.flatten(jwksObjs.map(j => j.keys))}

    return JWKS.asKeyStore(aggregated)
})
.WithCache(DefaultCacheFactory.Generate(`GetDataHolderJwksFromRegisterNeuron.${dataholderBrandId}`,JWKSSerial))
.AddValidator(async (jwks:JWKS.KeyStore) => {
    jwks.get({alg:'PS256'})
    return true;
})


@injectable()
export class DataHolderRegistrationAccessTokenNeuron extends Neuron<[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration],AccessToken> {
    constructor(private cert:ClientCertificateInjector) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([jwks,oidc,registration]:[JWKS.KeyStore,DataholderOidcResponse,DataHolderRegistration]) => {

        return GetAccessToken(this.cert,jwks,oidc.token_endpoint,registration.clientId);

    }
}


@injectable()
export class BootstrapClientRegistrationNeuron extends Neuron<[SoftwareProductConnectivityConfig,DataholderRegisterMetadata],DataHolderRegistration|undefined> {
    constructor(private registrationManager: DataHolderRegistrationManager) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([productConfig,dhRegisterMeta]:[SoftwareProductConnectivityConfig,DataholderRegisterMetadata]) => {

        return await this.registrationManager.GetActiveRegistrationByIds(productConfig.ProductId,dhRegisterMeta.dataHolderBrandId);

    }
}

@injectable()
export class NewClientRegistrationNeuron extends Neuron<[AdrConnectivityConfig,SoftwareProductConnectivityConfig,JWKS.KeyStore,DataholderOidcResponse,DataholderRegisterMetadata,string],DataHolderRegistration> {
    constructor(private registrationManager: DataHolderRegistrationManager, private cert:ClientCertificateInjector) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([config,productConfig,jwks,dhOidc,dhRegisterMeta,ssa]:[AdrConnectivityConfig,SoftwareProductConnectivityConfig,JWKS.KeyStore,DataholderOidcResponse,DataholderRegisterMetadata,string]) => {

        let response = await NewRegistrationAtDataholder(ssa,dhRegisterMeta,dhOidc,config,productConfig,jwks,this.cert)
        let registration = await this.registrationManager.NewRegistration(response,dhRegisterMeta.dataHolderBrandId)
        return registration;
    }
}

export class DataholderOidcResponse {
    @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
    token_endpoint: string;

    @IsUrl({require_tld:false}) // TODO change to https only/remove since this is default.
    userinfo_endpoint: string;

    @IsUrl({require_tld:false}) 
    registration_endpoint: string;

    @IsUrl({require_tld:false})
    jwks_uri: string;

    @IsUrl({require_tld:false})
    authorization_endpoint: string;

    @IsUrl({require_tld:false})
    introspection_endpoint: string;

    @IsUrl({require_tld:false})
    revocation_endpoint: string;

    @IsUrl({require_tld:false})
    issuer: string;

    scopes_supported: string[]
    response_types_supported: string[]
    response_modes_supported: string[]
    grant_types_supported: string[]
    acr_values_supported: string[]
    subject_types_supported: string[]

    id_token_encryption_alg_values_supported?: string[]
    id_token_encryption_enc_values_supported?: string[]

    id_token_signing_alg_values_supported: string[]
    request_object_signing_alg_values_supported: string[]
    token_endpoint_auth_methods_supported: string[]
    mutual_tls_sender_constrained_access_tokens: any
    claims_supported: string

    constructor(data:any) {
        if (typeof data != 'object') throw 'Contructor input must be an object';
        this.issuer = data.issuer;
        this.jwks_uri = data.jwks_uri;
        this.token_endpoint = data.token_endpoint;
        this.userinfo_endpoint = data.userinfo_endpoint;
        this.authorization_endpoint = data.authorization_endpoint;
        this.registration_endpoint = data.registration_endpoint;
        this.introspection_endpoint = data.introspection_endpoint;
        this.revocation_endpoint = data.revocation_endpoint;

        this.scopes_supported = data.scopes_supported
        this.response_types_supported = data.response_types_supported
        this.response_modes_supported = data.response_modes_supported
        this.grant_types_supported = data.grant_types_supported
        this.acr_values_supported = data.acr_values_supported
        this.subject_types_supported = data.subject_types_supported

        this.id_token_signing_alg_values_supported = data.id_token_signing_alg_values_supported
        this.id_token_encryption_enc_values_supported = data.id_token_encryption_enc_values_supported
        this.id_token_encryption_alg_values_supported = data.id_token_encryption_alg_values_supported

        this.request_object_signing_alg_values_supported = data.request_object_signing_alg_values_supported
        this.token_endpoint_auth_methods_supported = data.token_endpoint_auth_methods_supported
        this.mutual_tls_sender_constrained_access_tokens = data.mutual_tls_sender_constrained_access_tokens
        this.claims_supported = data.claims_supported

    }
}


