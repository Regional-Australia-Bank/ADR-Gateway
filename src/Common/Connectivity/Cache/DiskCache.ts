import _ from "lodash"
import fs from "fs"
import path from "path"
import { AbstractCache, CacheImplementationStatus } from "./AbstractCache";
import { Dependency } from "../Dependency";
import { Dictionary } from "../../Server/Types";
import moment from "moment";

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
        safefilenames[s] = path.join(process.env.CACHE_FOLDER,`${right}`.trim())
    }
    return safefilenames[s]
}


export class DiskCache extends AbstractCache {
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

    UpdateCache = async (dependency: Dependency<any,any,any>, parameters:Dictionary<string>, result: any):Promise<void> => {
        fs.writeFileSync(
            SafeFileName(DiskCache.GetStoreId(dependency,parameters)),
            DiskCache.Serialize(dependency,result)
        )
    }
    FetchCache = async (dependency: Dependency<any,any,any>, parameters:Dictionary<string>):Promise<CacheImplementationStatus> => {
        let filename = SafeFileName(DiskCache.GetStoreId(dependency,parameters))

        if (fs.existsSync(filename)) {
            let manifest = DiskCache.Deserialize(dependency,fs.readFileSync(filename,'utf8'))
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
    EmptyCache = async (dependency: Dependency<any,any,any>, parameters:Dictionary<string>):Promise<void> => {
        if (fs.existsSync(SafeFileName(DiskCache.GetStoreId(dependency,parameters)))) {
            fs.unlinkSync(SafeFileName(DiskCache.GetStoreId(dependency,parameters)))
        }
    }
    
}