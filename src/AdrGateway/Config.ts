import convict = require("convict");
import _ from "lodash"
import { AdrConnectivityConfig, ConnectivityConvictOptions, LoadMtls } from "../Common/Config";


export interface AdrGatewayConfig extends AdrConnectivityConfig { // TODO This will be the new configuration
    Port: number,
    Logging?:{logfile?:string},
    BackEndBaseUri: string
}

export const GetBackendConfig = async (configFile?:string):Promise<AdrGatewayConfig> => {

    const config = convict(_.merge({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8101,
            env: 'ADR_BACKEND_PORT'
        },
        Logging: {
            logfile:{
                doc: 'File to log out to',
                format: 'String',
                default: undefined,
                env: 'ADR_GW_LOG_FILE'    
            }
        },
        BackEndBaseUri: {
            doc: 'Exposed Uri of the Backend (used to change links from DH paginated endpoints)',
            format: 'url',
            default: 'https://localhost:9101/',
            env: 'ADR_GW_BACKEND_BASE'    
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

export const GetHousekeeperConfig = async (configFile?:string):Promise<AdrConnectivityConfig> => {

    const config = convict(_.merge({
        Logging: {
            logfile:{
                doc: 'File to log out to',
                format: 'String',
                default: undefined,
                env: 'ADR_GW_LOG_FILE'    
            }
        },

    },ConnectivityConvictOptions()))

    config.load({Database: (process.env.ADR_DATABASE_OPTIONS && JSON.parse(process.env.ADR_DATABASE_OPTIONS)) || {} })

    await LoadMtls(config)

    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}