import * as _ from "lodash"
import fs from "fs"
import path from "path"
import { AbstractCache, CacheOptions } from "./AbstractCache";

let safefilenames:{[key: string]:string} = {}

let fileCounter = 0;
const NUM_PADDING=4;
const MAX_LENGTH=100;
const MAX_RIGHT = MAX_LENGTH - NUM_PADDING - 1;

const SafeFileName = (s:string) => {
    if (!safefilenames[s]) {
        fileCounter++;
        fileCounter.toFixed()
        let numStr = `${fileCounter}`;
        let left = _.map(_.range(NUM_PADDING - numStr.length),() => "0").join("")+numStr;
    
        let right = _.filter(_.map(s),c => {
            if (/^[a-zA-Z0-9\-_\. ]$/.test(c)) return true;
        }).join("").substr(0,MAX_RIGHT)
        safefilenames[s] = path.join(process.env.CACHE_FOLDER,`$${right}`.trim())
    }
    return safefilenames[s]
}


export class DiskCache<T> extends AbstractCache<T> {
    constructor(protected storeName:string, protected options: CacheOptions<T>) {
        super(storeName, options)
    }

    UpdateCache = async (v: T):Promise<void> => {
        fs.writeFileSync(SafeFileName(this.storeName),this.options.Serializer(v))
    }
    FetchCache = async ():Promise<T> => {
        if (fs.existsSync(SafeFileName(this.storeName))) {
            return this.options.Deserializer(fs.readFileSync(SafeFileName(this.storeName),'utf8'))
        } else {
            throw 'DiskCache: Cache value is undefined'
        }
    }
    EmptyCache = async ():Promise<void> => {
        if (fs.existsSync(SafeFileName(this.storeName))) {
            fs.unlinkSync(SafeFileName(this.storeName))
        }
    }
    
}