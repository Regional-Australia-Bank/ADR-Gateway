import { AdrConnectivityConfig, SoftwareProductConnectivityConfig } from "../../../Config";
import { injectable } from "tsyringe";
import {Length, IsUrl, MinLength, validate} from "class-validator";
import { DefaultCacheFactory, JWKSSerial } from "../Cache/DefaultCacheFactory";
import { JWKS } from "jose";
import {AxiosResponse} from "axios";
import _ from "lodash";

import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { GetJwks } from "../../../../Common/Init/Jwks";
import { axios } from "../../../../Common/Axios/axios";
import { Dictionary } from "../../../../Common/Server/Types";

@injectable()
export class SoftwareProductConfig extends Neuron<AdrConnectivityConfig,SoftwareProductConnectivityConfig> {
    constructor(private softwareProductId:string) {
        super()
        this.cache = DefaultCacheFactory.Generate(`SoftwareProductConfig-${softwareProductId}`); // Use generic cache for the moment
        // this.AddValidator(async (jwks) => {}) // TODO add validator
    }

    evaluator = async (c:AdrConnectivityConfig):Promise<SoftwareProductConnectivityConfig> => {
        return (await axios.get(c.SoftwareProductConfigUris[this.softwareProductId],{responseType:"json"})).data;
    };
}

export class SoftwareProductConfigs extends Neuron<AdrConnectivityConfig,Dictionary<SoftwareProductConnectivityConfig>> {
    constructor() {
        super()
        this.cache = DefaultCacheFactory.Generate(`SoftwareProductConfigs`); 
    }

    evaluator = async (config:AdrConnectivityConfig):Promise<Dictionary<SoftwareProductConnectivityConfig>> => {

        let promises:Dictionary<Promise<AxiosResponse<SoftwareProductConnectivityConfig>>> = {}

        for (let [key,uri] of Object.entries(config.SoftwareProductConfigUris)) {
            promises[key] = (axios.get(uri,{responseType:"json"}))
        }
        
        let values = _.map(await Promise.all(Object.values(promises)), v => v.data);
        let keys = Object.keys(promises);
        let result = _.zipObject(keys,values)
        return result;
        
    };
}

