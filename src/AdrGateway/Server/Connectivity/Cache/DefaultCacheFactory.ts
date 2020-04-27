import { CachingImplementation } from "../../../../Common/Connectivity/Neuron";
import { DiskCache } from "./DiskCache";
import { InMemoryCache } from "./InMemoryCache";
import { CacheOptions } from "./AbstractCache";


const defaultDeserializer = JSON.parse
const defaultSerializer = JSON.stringify

export class DefaultCacheFactory {
    constructor(private storeName:string) {}

    static Generate = <ValueType>(storeName:string, options?:CacheOptions<ValueType>) => {
        options == options || {
            Serializer: defaultSerializer,
            Deserializer: defaultDeserializer
        }

        if (process.env.CACHE_FOLDER) {
            return new DiskCache<ValueType>(storeName,options);
        } else {
            return new InMemoryCache<ValueType>(storeName,options);
        }
    }
}