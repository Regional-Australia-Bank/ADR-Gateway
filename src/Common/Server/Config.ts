import { Dictionary } from "./Types";
import {ConnectionOptions} from "typeorm"
import _ from "lodash"
import convict = require("convict");
import { JWKS } from "jose";
import { GetJwks } from "../Init/Jwks";

export const ConvictFormats = {
    Jwks: {
        name:'Jwks',
        validate: function(val) {
            if (typeof val !== 'string') {
                let jwks = JWKS.asKeyStore(val)
                // if (jwks.size < 1) throw new Error("Supplied empty JWKS")
            } else {
                // TODO validate that we have a valid URL
            }
        },
        coerce: function(val) {
            try {
                return JSON.parse(val)
            } catch {
                return val;
            }
        }
    },
    StringArrayOrSingle: {
        name: 'StringArrayOrSingle',
        validate: function(val) {
            if (typeof val === 'string') return;
            if (Array.isArray(val)){
                for (let v of val) {
                    if (typeof v !== 'string') throw new Error(`Not a string: ${v}`);
                }
                return true;
            };
            throw new Error('Expected a string or an array of strings');
        }
    },
    JsonStringDict: {
        name: 'JsonStringDict',
        validate: function(val) {
            for (let [k,v] of Object.entries(val)) {
                if (typeof k !== 'string' || typeof v !== 'string') throw new Error('must be a dictionary of strings');
            }
        },
        coerce: function(val) {
            if (val && val.length) {
                return JSON.parse(val)
            } else {
                return undefined;
            }
        }    
    },
    IdTokenEncAlgSets: {
        name: 'IdTokenEncAlgSets',
        validate: function(val) {
            if (!val || !Array.isArray(val) || !val.length) {
                throw new Error('Expected array of length >= 1')
            }
            for (let set of val) {
                if (typeof set["id_token_encrypted_response_alg"] !== 'string' || typeof set["id_token_encrypted_response_enc"] !== 'string') {
                    throw new Error('Invalid enc pair')
                }    
            }
        },
        coerce: function(val) {
            if (val && val.length) {
                return JSON.parse(val)
            } else {
                return undefined;
            }
        }    
    },
    SoftwareProductConfigUris: {
        name: 'SoftwareProductConfigUris',
        validate: function(val) {
            let entries = Object.entries(val);
            if (entries.length < 1) throw new Error('must be a dictionary of string keys');
            for (let [k,v] of entries) {
                if (typeof k !== 'string' || typeof v !== 'string') throw new Error('must be a dictionary of string keys');
            }
        },
        coerce: function(val) {
            if (val && val.length) {
                return JSON.parse(val)
            } else {
                return undefined;
            }
        }   
    },
    DefaultClaims: {
        name: 'DefaultClaims',
        validate: function(val) {
        },
        coerce: function(val) {
            if (val && val.length) {
                return _.pick(JSON.parse(val),'userinfo','id_token')
            } else {
                return undefined;
            }
        }    
    },
    RedirectUrlList: {
        name: 'RedirectUrlList',
        validate: function(val) {
            if (!val || !Array.isArray(val) || !val.length) {
                throw new Error('Expected array of length >= 1')
            }
        },
        coerce: function(val) {
            if (val && val.length) {
                return JSON.parse(val)
            } else {
                return undefined;
            }
        }    
    },
    XVHeader: {
        name: 'XVHeader',
        validate: function(val) {
            if (val === false) {
                return true;
            }
            if (typeof val == "string") {
                if (!(/^[1-9]\d?$/.test(val))){
                    throw new Error('Must be a whole number >= "1"')
                }
                return true;
            }
            throw new Error('Must be "false" or a positive integer string e.g. "1"')
        },
        coerce: function(val) {
            if (val === "false") return false;
            if (typeof val == "string") return val;
            return false;
        }
    },
    MtlsOptions: {
        name: 'MtlsOptions',
        validate: function(val) {
        },
        coerce: function(val) {
            if (val && val.length) {
                return JSON.parse(val)
            } else {
                return undefined;
            }
        }    
    }
}

convict.addFormats(ConvictFormats);

export const ConvictSchema = {
    Database: {
        type: {
            doc: 'Type of the database, e.g. pgsql, mssql',
            default: undefined,
            format: 'String'
        },
        host: {
            default: undefined,
            format: 'String'
        },
        port: {
            default: undefined,
            format: 'int'
        },
        username: {
            default: undefined,
            format: 'String'
        },
        password: {
            default: undefined,
            format: 'String'
        },
        database: {
            default: undefined,
            format: 'String'
        },
        schema: {
            default: undefined,
            format: 'String'
        },
    },

    Mtls: {
        key: {
            default: undefined,
            format: ConvictFormats.StringArrayOrSingle.name
        },
        cert: {
            default: undefined,
            format: ConvictFormats.StringArrayOrSingle.name
        },
        ca: {
            default: undefined,
            format: ConvictFormats.StringArrayOrSingle.name
        },
    }
    
}

export interface MtlsVerificationConfig {
    SecurityProfile: {
        ClientCertificates: IClientCertificateVerificationConfig,
    }
}

export interface JoseBindingConfig {
    SecurityProfile: {
        JoseApplicationBaseUrl: string
        AudienceRewriteRules: Dictionary<string>
    }
}

export interface IClientCertificateVerificationConfig {
    Headers: {
        ThumbprintHeader: string
    }
}