import { Dependency } from "../Dependency"
import { DiskCache } from "./DiskCache"
import { InMemoryCache } from "./InMemoryCache"

export type CacheImplementationStatus = {inCache: false} | {
    inCache: true,
    value: any,
    expired: boolean,
    tooFreshToUpdate: boolean
}

export abstract class AbstractCache {
    abstract UpdateCache: (dependency: Dependency<any,any,any>, parameters:object, result: any) => Promise<void>
    abstract FetchCache: (dependency: Dependency<any,any,any>, parameters:object) => Promise<CacheImplementationStatus>
    abstract EmptyCache: (dependency: Dependency<any,any,any>, parameters:object) => Promise<void>
}