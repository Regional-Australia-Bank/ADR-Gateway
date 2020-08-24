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
        this.legalEntityName = dm.legalEntity.legalEntityName
        this.websiteUri = dm.endpointDetail.websiteUri
        this.abn = dm.legalEntity.abn
        this.acn = dm.legalEntity.acn
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
        if (oneDataHolder.length != 1) throw 'Expected exactly 1 matching dataholder';
        return oneDataHolder[0];
    }

}

export {DataHolderMetadataProvider,DataholderMetadata}