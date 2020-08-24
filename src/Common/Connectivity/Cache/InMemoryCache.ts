import _ from "lodash"
import { AbstractCache, CacheImplementationStatus, } from "./AbstractCache";
import moment from "moment";
import { Dependency } from "../Dependency";

let defaultGlobalStore:{[key: string]:any} = {}

export const ClearDefaultInMemoryCache = () => {
    for (let k of Object.keys(defaultGlobalStore)) {
        delete defaultGlobalStore[k]
    }
}

export class InMemoryCache extends AbstractCache {
    store:{[key: string]:any} = {}

    constructor(store?:{[key: string]:any}) {
        super();
        this.store = store || defaultGlobalStore
    }

    static GetStoreId = (dependency: Dependency<any,any,any>, parameters:object) => {
        let storeName = dependency.spec.name;
        for (let [k, toString] of Object.entries(dependency.spec.parameters)) {
            let v = toString(parameters[k]);
            storeName += `_${v}`;
        }
        return storeName;
    }

    static Serialize = (dependency: Dependency<any,any,any>, result:any) => {
        let expiresAt = dependency.spec.cache?.maxAge && moment().utc().add(dependency.spec.cache?.maxAge,'seconds').toISOString()
        let freshUntil = dependency.spec.cache?.minAge && moment().utc().add(dependency.spec.cache?.minAge,'seconds').toISOString()
        let value = dependency.serializer.Serialize(result)
        return JSON.stringify({expiresAt, freshUntil, value})
    }

    static Deserialize = (dependency: Dependency<any,any,any>, result:any) => {
        let manifest:{
            value:string,
            expiresAt?:string,
            freshUntil?:string
        } = JSON.parse(result);
        let {value,expiresAt,freshUntil} = {
            value: dependency.serializer.Deserialize(manifest.value),
            expiresAt: manifest.expiresAt && moment(manifest.expiresAt),
            freshUntil: manifest.freshUntil && moment(manifest.freshUntil)
        }
        return {value,expiresAt,freshUntil}
    }
    
    UpdateCache = async (dependency: Dependency<any,any,any>, parameters:object, result: any):Promise<void> => {
        let k = InMemoryCache.GetStoreId(dependency,parameters)

        let v = InMemoryCache.Serialize(dependency,result)

        this.store[k] = v;
    }
    FetchCache = async (dependency: Dependency<any,any,any>, parameters:object):Promise<CacheImplementationStatus> => {
        let k = InMemoryCache.GetStoreId(dependency,parameters)
        let v = this.store[k]
        if (v) {
            let manifest = InMemoryCache.Deserialize(dependency,v)
            let status:CacheImplementationStatus = {
                inCache: true,
                expired: manifest.expiresAt && moment().isSameOrAfter(moment(manifest.expiresAt)),
                tooFreshToUpdate: manifest.freshUntil && moment().isSameOrBefore(moment(manifest.freshUntil)),
                value: manifest.value
            }
            return status;
        } else {
            return {
                inCache: false
            }
        }
    }
    EmptyCache = async (dependency: Dependency<any,any,any>, parameters:object):Promise<void> => {
        this.store = _.fromPairs(_.filter(_.toPairs(this.store),([k,v]) => k != InMemoryCache.GetStoreId(dependency,parameters)));
    }
    
}