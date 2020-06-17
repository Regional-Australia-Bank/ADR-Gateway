import * as _ from "lodash"
import { AbstractCache, CacheOptions } from "./AbstractCache";

let stores:{[key: string]:any} = {}

export class InMemoryCache<T> extends AbstractCache<T> {
    constructor(protected storeName:string, protected options: CacheOptions<T>) {
        super(storeName, options)
    }

    UpdateCache = async (v: T):Promise<void> => {
        stores[this.storeName] = v;
    }
    FetchCache = async ():Promise<T> => {
        if (typeof stores[this.storeName] == 'undefined') throw 'InMemoryCache: Cache value is uPndefined'
        return stores[this.storeName];
    }
    EmptyCache = async ():Promise<void> => {
        stores = _.fromPairs(_.filter(_.toPairs(stores),([k,v]) => k != this.storeName));
    }
    
}