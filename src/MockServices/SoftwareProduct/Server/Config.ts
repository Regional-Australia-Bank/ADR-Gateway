
import convict = require("convict");
import { ConvictFormats } from "../../../Common/Server/Config";
import { TestDataRecipientApplication } from "../../Register/MockData/DataRecipients";
import { SoftwareProductConnectivityConfig } from "../../../Common/Config";

export type MockSoftwareProductConfig = {
    Port: number
} & SoftwareProductConnectivityConfig

export const GetConfig = (configFile?:string):MockSoftwareProductConfig => {
    const config = convict({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8401,
            env: 'ADR_PRODUCT_PORT'
        },

        ProductId: {env: 'ADR_PRODUCT_ID', format:'String', default: TestDataRecipientApplication.ProductId},
        redirect_uris: {env: 'ADR_REDIRECT_URIS', format:ConvictFormats.RedirectUrlList.name, default: TestDataRecipientApplication.redirect_uris},
        standardsVersion: {env: 'ADR_STANDARDS_VERSION', format:Number, default: TestDataRecipientApplication.standardsVersion},
        standardsVersionMinimum: {env: 'ADR_STANDARDS_VERSION_MIN', format:Number, default: TestDataRecipientApplication.standardsVersionMinimum},
        uris: {
            logo_uri: {env: 'ADR_LOGO_URI', format:'url', default: TestDataRecipientApplication.uris.logo_uri},
            tos_uri: {env: 'ADR_TOS_URI', format:'url', default: TestDataRecipientApplication.uris.tos_uri},
            policy_uri: {env: 'ADR_POLICY_URI', format:'url', default: TestDataRecipientApplication.uris.policy_uri},
            jwks_uri: {env: 'ADR_JWKS_URI', format:'url', default: TestDataRecipientApplication.uris.jwks_uri},
            revocation_uri: {env: 'ADR_REVOKE_URI', format:'url', default: TestDataRecipientApplication.uris.revocation_uri}
        },
        DefaultClaims: {
            doc: 'Default claims to apply for new consent request',
            format: ConvictFormats.DefaultClaims.name,
            default: undefined,
            env: 'ADR_DEFAULT_CLAIMS'
        },
        AuthCallbackUrl: {
            doc: 'Url for the OAuth2 Authorize response',
            format: "url",
            default: "https://regaustbank.io/",
            env: 'ADR_AUTH_CALLBACK'
        }
    })

    config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}