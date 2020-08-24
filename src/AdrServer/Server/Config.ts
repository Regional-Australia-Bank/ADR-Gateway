import convict = require("convict");
import { ConvictFormats, JoseBindingConfig } from "../../Common/Server/Config";
import _ from "lodash"
import { AdrConnectivityConfig, ConnectivityConvictOptions, LoadMtls } from "../../Common/Config";

export type AdrServerConfig = {
    Port: number,
} & AdrConnectivityConfig & JoseBindingConfig

export const GetConfig = async (configFile?:string):Promise<AdrServerConfig> => {

    const config = convict(_.merge({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8102,
            env: 'ADR_FRONTEND_PORT'
        },
        SecurityProfile: {
            JoseApplicationBaseUrl: {
                doc: 'Base Url clients will use to populate the audience claims',
                format: 'String',
                default: "https://localhost:9102",
                env: "ADR_JOSE_APPLICATION_BASE_URL"
            },
            AudienceRewriteRules: {
                doc: 'A dictionary of linking the endpoint to the public endpoint relative to JoseApplicationBaseUrl e.g. {"/revoke":"/affordability/security/revoke"}',
                format: ConvictFormats.JsonStringDict.name,
                default: {'/revoke':'/revoke'},
                env: "ADR_JOSE_AUDIENCE_MAP"
            }
        }

    },ConnectivityConvictOptions()))

    config.load({Database: (process.env.ADR_DATABASE_OPTIONS && JSON.parse(process.env.ADR_DATABASE_OPTIONS)) || {} })

    await LoadMtls(config)
    
    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}