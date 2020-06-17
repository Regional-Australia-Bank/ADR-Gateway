import { CachingImplementation } from "../../../../Common/Connectivity/Neuron";

export interface CacheOptions<T> {
    Serializer: (i:T) => string
    Deserializer: (i:string) => T
}

export abstract class AbstractCache<T> implements CachingImplementation<T> {
    protected serial: CacheOptions<T>

    constructor (protected storeName:string, options: CacheOptions<T>) {
        this.serial = options;
    }

    abstract UpdateCache: (v: T) => Promise<void>
    abstract FetchCache: () => Promise<T>
    abstract EmptyCache: () => Promise<void>
}