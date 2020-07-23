import { DiskCache } from "./DiskCache";
import { InMemoryCache } from "./InMemoryCache";

export class DefaultCache {
    constructor() {
        if (process.env.CACHE_FOLDER) {
            return new DiskCache();
        } else {
            return new InMemoryCache();
        }
    }
}