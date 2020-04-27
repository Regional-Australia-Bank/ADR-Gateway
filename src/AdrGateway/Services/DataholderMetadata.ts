import { JWKS, JWK } from "jose"
import * as _ from "lodash"
import { injectable } from "tsyringe";
import { DataholderRegisterMetadata } from "../Server/Connectivity/Neurons/RegisterDataholders";
import { DefaultPathways } from "../Server/Connectivity/Pathways";
import { PathwayFactory } from "../../Common/Connectivity/PathwayFactory";

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
    constructor(private pw:DefaultPathways,dm:DataholderRegisterMetadata) {
        this.dataHolderBrandId = dm.dataHolderBrandId;
        this.brandName = dm.brandName;


        // TODO replace with live data holder value when github issue is solved
        const getLogoUri = (text:string) => {
            let abbr = text.substr(0,3).toUpperCase();

            let hue = (_.reduce(_.map(this.dataHolderBrandId,c=>c.charCodeAt(0)),(sum,n)=>sum + n));
            if (typeof hue != 'number') throw 'I can hardly believe this'
            hue = Math.floor(hue * 360* 360 * 0.128376128763123) % 360

            const HSLToHex = (h:number,s:number,l:number) => {
                s /= 100;
                l /= 100;
              
                let c = (1 - Math.abs(2 * l - 1)) * s,
                    x = c * (1 - Math.abs((h / 60) % 2 - 1)),
                    m = l - c/2,
                    r = 0,
                    g = 0,
                    b = 0;
              
                if (0 <= h && h < 60) {
                  r = c; g = x; b = 0;
                } else if (60 <= h && h < 120) {
                  r = x; g = c; b = 0;
                } else if (120 <= h && h < 180) {
                  r = 0; g = c; b = x;
                } else if (180 <= h && h < 240) {
                  r = 0; g = x; b = c;
                } else if (240 <= h && h < 300) {
                  r = x; g = 0; b = c;
                } else if (300 <= h && h < 360) {
                  r = c; g = 0; b = x;
                }
                // Having obtained RGB, convert channels to hex
                let rs = Math.round((r + m) * 255).toString(16);
                let gs = Math.round((g + m) * 255).toString(16);
                let bs = Math.round((b + m) * 255).toString(16);
              
                // Prepend 0s, if necessary
                if (rs.length == 1)
                  rs = "0" + rs;
                if (gs.length == 1)
                  gs = "0" + gs;
                if (bs.length == 1)
                  bs = "0" + bs;
              
                return "#" + rs + gs + bs;
            }

            let colorHex = HSLToHex(hue,80,20);

            let svg = `<svg version="1.1"
            baseProfile="full"
            width="200" height="200"
            xmlns="http://www.w3.org/2000/svg">
         <circle cx="100" cy="100" r="80" fill="${colorHex}" />
         <text x="100" y="125" font-size="60" font-family="sans-serif" text-anchor="middle" fill="white">${abbr}</text></svg>`;

            let svgBase64 = (new Buffer(svg)).toString('base64');

            let uri = `data:image/svg+xml;base64,${svgBase64}`;
            return uri;
        }

        this.logoUri = getLogoUri(dm.brandName);
        this.industry = dm.industry;
        this.legalEntityName = dm.legalEntity.legalEntityName
        this.websiteUri = dm.endpointDetail.websiteUri
        this.abn = dm.legalEntity.abn
        this.acn = dm.legalEntity.acn
    }

    validate = ():boolean => {
        return false;
    }


    getResourceEndpoint = async () => {return (await this.pw.DataHolderBrandMetadata(this.dataHolderBrandId).GetWithHealing()).endpointDetail.resourceBaseUri}

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
        private pathwayFactory:DefaultPathways
    ){super()}

    getDataHolders = async ():Promise<EcosystemDataholder[]> => {
        return _.map(await this.pathwayFactory.DataHolderBrands().GetWithHealing(v => true),dm => {
            return new EcosystemDataholder(this.pathwayFactory,dm)
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