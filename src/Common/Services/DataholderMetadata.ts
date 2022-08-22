import { JWKS } from "jose"
import _ from "lodash"
import { injectable } from "tsyringe";
import { DefaultConnector } from "../Connectivity/Connector.generated";
import { DataHolderRegisterMetadata } from "../Connectivity/Types";

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

abstract class DataHolderMetadataProvider<T extends DataholderMetadata> {
    abstract getDataHolders: () => Promise<T[]>
    abstract getDataHolder: (clientId:string) => Promise<T>
}

class EcosystemDataholder implements DataholderMetadata {
    constructor(dm:DataHolderRegisterMetadata) {
        this.dataHolderBrandId = dm.dataHolderBrandId;
        this.brandName = dm.brandName;
        this.logoUri = dm.logoUri;
        this.industry = dm.industry;
        this.legalEntityName = dm.legalEntity?.legalEntityName
        this.websiteUri = dm.endpointDetail?.websiteUri
        this.abn = dm.legalEntity?.abn
        this.acn = dm.legalEntity?.acn
    }

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
            return new EcosystemDataholder(dm)
        })
    }

    getDataHolder = async (dataHolderBrandId: string):Promise<EcosystemDataholder> => {
        let oneDataHolder = _.filter(await this.getDataHolders(),dh => dh.dataHolderBrandId == dataHolderBrandId);
        if (oneDataHolder.length == 0) return new EcosystemDataholder({
            "brandName": "Dataholder not found",
            "dataHolderBrandId": dataHolderBrandId,
            "industry": "Dataholder not found",
            "logoUri": "Dataholder not found",
            "endpointDetail": {
                "extensionBaseUri": "Dataholder not found",
                "infosecBaseUri": "Dataholder not found",
                "publicBaseUri": "Dataholder not found",
                "resourceBaseUri": "Dataholder not found",
                "version": "Dataholder not found",
                "websiteUri": "Dataholder not found"
            },
            "authDetails": [{
                "jwksEndpoint": "Dataholder not found",
                "registerUType": "Dataholder not found"
            }],
            "lastUpdated": "Dataholder not found",
            "legalEntity": {
                "legalEntityId": "",
                "abn": "",
                "acn": "",
                "arbn": "",
                "industryCode": "",
                "legalEntityName": "",
                "organisationType": "",
                "registeredCountry": "",
                "registrationDate": "",
                "registrationNumber": ""
            },
            "status": "Dataholder not found"
        });
        if (oneDataHolder.length != 1) throw 'Expected exactly 1 matching dataholder for ' + dataHolderBrandId + '. Found ' + oneDataHolder.length + ' instead.';
        return oneDataHolder[0];
    }

}

export {DataHolderMetadataProvider,DataholderMetadata}