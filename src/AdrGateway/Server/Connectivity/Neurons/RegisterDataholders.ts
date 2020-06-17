import { AdrConnectivityConfig, SoftwareProductConnectivityConfig } from "../../../Config";
import { injectable, inject } from "tsyringe";
import _ from "lodash"
import { DefaultCacheFactory } from "../Cache/DefaultCacheFactory";
import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { Validator } from "class-validator";
import { AccessToken } from "./RegisterToken";
import { JWT } from "jose";
import moment from "moment"
import uuid from "uuid";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { NoneFoundError } from "../Errors";
import { axios } from "../../../../Common/Axios/axios";

export interface DataholderRegisterMetadata {
    dataHolderBrandId: string,
    brandName: string,
    industry: string,
    legalEntity: {
        legalEntityId: string,
        legalEntityName: string,
        registrationNumber: string,
        registrationDate: string,
        registeredCountry: string,
        abn: string,
        acn: string,
        arbn: string,
        industryCode: string,
        organisationType: string
    },
    status: string,
    endpointDetail: {
        version: string,
        publicBaseUri: string,
        resourceBaseUri: string,
        infosecBaseUri: string,
        extensionBaseUri: string,
        websiteUri: string
    },
    authDetails: [
        {
            registerUType: string,
            jwksEndpoint: string
        }
    ],
    lastUpdated: string
}

const GetDataHoldersResponse = async (accessToken:string, nextUrl:string, cert:ClientCertificateInjector):Promise<DataholderRegisterMetadata[]> => {
    let response = await axios.get(nextUrl,cert.inject({responseType:"json", headers:{Authorization: `Bearer ${accessToken}`}}))
    let responseObject = response.data;
    if (typeof responseObject.meta != 'object' || typeof responseObject.links != 'object') {
        throw 'Response from register for GetDataHolders is not conformant'
    }
    let dataholders:object[] = responseObject.data;
    if (typeof responseObject.links.next == 'string') {
        let nextDataHolders = await GetDataHoldersResponse(accessToken,responseObject.links.next,cert);
        return <any>_.concat(dataholders,nextDataHolders);
    } else {
        return <any>dataholders;
    }
}

const GetDataholders = async ([config, registerToken, cert]: [AdrConnectivityConfig, AccessToken, ClientCertificateInjector]): Promise<DataholderRegisterMetadata[]> => {
    let nextUrl = config.RegisterBaseUris.SecureResource + '/v1/banking/data-holders/brands?page-size=20'; // TODO move the page limitation to an integration test and config option

    let dataholders = await GetDataHoldersResponse(registerToken.accessToken,nextUrl,cert);

    return dataholders;
}

const GetSSA = async ([config, productConfig, registerToken, cert]: [AdrConnectivityConfig, SoftwareProductConnectivityConfig, AccessToken, ClientCertificateInjector]): Promise<string> => {
    let brandId = config.BrandId;
    let productId = productConfig.ProductId;
    let nextUrl = config.RegisterBaseUris.SecureResource + `/v1/banking/data-recipients/brands/${brandId}/software-products/${productId}/ssa`; // TODO move the page limitation to an integration test and config option

    let response = await axios.get(nextUrl, cert.inject({headers: {Authorization: `Bearer ${registerToken.accessToken}`}}))

    return response.data;
}

@injectable()
export class RegisterGetDataholdersNeuron extends Neuron<[AdrConnectivityConfig, AccessToken], DataholderRegisterMetadata[]> {
    constructor(@inject("ClientCertificateInjector") private cert:ClientCertificateInjector) {
        super()
        this.cache = DefaultCacheFactory.Generate("RegisterGetDataholdersNeuron", {
            Serializer: (meta) => {
                let wrap = {
                    data: meta,
                    created: moment().utc().toISOString(),
                    ttl: parseInt(process.env.DATAHOLDER_META_EXPIRY_SECONDS || "30")//s
                }
                return JSON.stringify(wrap)
            },
            Deserializer: (s:string) => {
                let wrap = JSON.parse(s);
                if (!((typeof wrap?.ttl == 'number') && (typeof wrap?.created == 'string'))) throw 'Invalid cache serialization'
                if (moment(wrap.created).add(wrap.ttl,'seconds').isBefore(moment())) throw 'Cache has expired'
                return wrap.data
            }
        })    }
    evaluator = ([config,token]:[AdrConnectivityConfig,AccessToken]) => GetDataholders([config,token,this.cert]);
    
}

@injectable()
export class RegisterGetSSANeuron extends Neuron<[AdrConnectivityConfig, SoftwareProductConnectivityConfig, AccessToken], string> {
    constructor(@inject("ClientCertificateInjector") private cert:ClientCertificateInjector) {
        super()
        this.AddValidator(async (o) => new Validator().isJWT(o))
        this.AddValidator(async (ssa) => 
        {
            let decoded = <any>JWT.decode(ssa,{complete:true});
            let diff = moment(decoded.payload.exp*1000).utc().diff(moment().utc(),'seconds');
            if (diff < 150) throw "The SSA is expiring too soon";
            return true;
        });
        (<any>this).debugId = uuid.v4() // TODO remove
    }
    evaluator = ([e,p,a]:[AdrConnectivityConfig,SoftwareProductConnectivityConfig, AccessToken]) => {
        return GetSSA([e,p,a,this.cert]);
    };
    
}

@injectable()
export class GetDataHolderBrandMetadataNeuron extends Neuron<DataholderRegisterMetadata[], DataholderRegisterMetadata> {
    constructor(private dataHolderBrandId:string) {
        super()
    }
    evaluator = async (dataholders:DataholderRegisterMetadata[]) => {
        let dataholderMeta = _.filter(dataholders, dh => dh.dataHolderBrandId == this.dataHolderBrandId);
        if (dataholderMeta.length != 1) throw new NoneFoundError(`GetDataHolderBrandMetadataNeuron: Expected exactly one matching dataholder for dataHolderBrandId=${this.dataHolderBrandId} but found ${dataholderMeta.length}`);
        return dataholderMeta[0];
    };
    
}