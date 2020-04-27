import { Dictionary } from "./Types";
import {ConnectionOptions} from "typeorm"

interface IAppConfig {
    SecurityProfile: {
        ClientCertificates: IClientCertificateVerificationConfig,
        JoseApplicationBaseUrl: string
        AudienceRewriteRules: Dictionary<string>
    },
    Database: ConnectionOptions,
    Logging: {
        logfile: string
    },
    FrontEndUrl: string
}

interface IClientCertificateVerificationConfig {
    Headers: {
        ThumbprintHeader: string
    }
}

export {IAppConfig,IClientCertificateVerificationConfig};