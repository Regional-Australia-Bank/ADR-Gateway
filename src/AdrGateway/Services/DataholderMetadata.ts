import { JWKS } from "jose"
import * as _ from "lodash"
import { injectable } from "tsyringe";
import { DefaultConnector } from "../Server/Connectivity/Connector.generated";
import { DataHolderRegisterMetadata } from "../Server/Connectivity/Types";

interface DataholderMethods {
    getAuthEndpoint(): Promise<string>
    getIssuerIdentifier(): Promise<string>
    getTokenEndpoint(): Promise<string>
    getResourceEndpoint(): Promise<string>
    getJwksEndpoint(): Promise<string>
    getUserInfoEndpoint(): Promise<string>
    getClientId(): Promise<string>
    getSignatureVerificationKeyStore(): Promise<JWKS.KeyStore>
}

type Dataholder = DataholderMethods & DataholderMetadata;

interface DataholderMetadata{
    "dataHolderBrandId": string,
    "brandName": string,
    "logoUri": string,
    "websiteUri": string,
    "industry": string,
    "legalEntityName": string,
    "abn": string,
    "acn": string,
}

interface DataholderOidcMetadata extends DataholderMetadata {
    oidcEndpoint: string
    resourceEndpoint: string
}

interface ManualEndpointsDataholderMetadata extends DataholderMetadata {
    "jwksEndpoint": string,
    "authEndpoint": string,
    "tokenEndpoint": string,
    "resourceEndpoint": string,
    "websiteUri": string
}

type ManualEndpointsDataholder = DataholderMethods & ManualEndpointsDataholderMetadata;


abstract class DataHolderMetadataProvider<T extends Dataholder> {
    abstract getDataHolders: () => Promise<T[]>
    abstract getDataHolder: (clientId:string) => Promise<T>
    abstract getAuthEndpoint: (dataHolderBrandId:string) => Promise<string>
}

class EcosystemDataholder implements Dataholder {
    constructor(private connector:DefaultConnector,dm:DataHolderRegisterMetadata) {
        this.dataHolderBrandId = dm.dataHolderBrandId;
        this.brandName = dm.brandName;


        // TODO replace with live data holder value when github issue is solved

        this.logoUri = dm.logoUri;
        this.industry = dm.industry;
        this.legalEntityName = dm.legalEntity.legalEntityName
        this.websiteUri = dm.endpointDetail.websiteUri
        this.abn = dm.legalEntity.abn
        this.acn = dm.legalEntity.acn
    }

    validate = ():boolean => {
        return false;
    }


    getResourceEndpoint = async () => {return (await this.connector.DataHolderBrandMetadata(this.dataHolderBrandId).GetWithHealing()).endpointDetail.resourceBaseUri}

    getAuthEndpoint = () => {throw new Error("Method not implemented.")}
    getTokenEndpoint = () => {throw new Error("Method not implemented.")}
    getJwksEndpoint = () => {throw new Error("Method not implemented.")}
    getUserInfoEndpoint = () => {throw new Error("Method not implemented.")}
    getClientId = () => {throw new Error("Method not implemented.")}
    getSignatureVerificationKeyStore = () => {throw new Error("Method not implemented.")}
    getIssuerIdentifier = () => {throw new Error("Method not implemented.")}

    "dataHolderBrandId": string;
    "brandName": string;
    "logoUri": string;
    "websiteUri": string;
    "industry": string;
    "legalEntityName": string;
    "abn": string;
    "acn": string;


}

@injectable()
export class SelfHealingDataHolderMetadataProvider extends DataHolderMetadataProvider<EcosystemDataholder> {
    constructor(
        private connector:DefaultConnector
    ){super()}

    getDataHolders = async ():Promise<EcosystemDataholder[]> => {
        return _.map(await this.connector.DataHolderBrands().GetWithHealing({validator: v => true}),dm => {
            return new EcosystemDataholder(this.connector,dm)
        })
    }

    getDataHolder = async (dataHolderBrandId: string):Promise<EcosystemDataholder> => {
        let oneDataHolder = _.filter(await this.getDataHolders(),dh => dh.dataHolderBrandId == dataHolderBrandId);
        if (oneDataHolder.length != 1) throw 'Expected exactly 1 matching dataholder';
        return oneDataHolder[0];
    }

    getAuthEndpoint = async (dataHolderBrandId: string):Promise<string> => {
        let dataholder = await this.getDataHolder(dataHolderBrandId);
        return dataholder.getAuthEndpoint();
    }
}

export {DataHolderMetadataProvider,ManualEndpointsDataholderMetadata,DataholderMetadata,DataholderOidcMetadata,Dataholder,DataholderMethods,ManualEndpointsDataholder}