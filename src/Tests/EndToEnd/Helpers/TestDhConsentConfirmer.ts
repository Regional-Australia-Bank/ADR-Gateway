import _ from "lodash";
import { TestContext } from "../Framework/TestContext";
import qs from "qs"
import { logger } from "../../Logger";
import { axios } from "../../../Common/Axios/axios";
import urljoin from "url-join";
import { NewConsentParams } from "../NewGatewayConsent";
import { URL } from "url";

interface ConsentConfirmationOptions {
    username: string,
    checkboxSelections?: string[]
}

interface OAuthHybridFlowResult {
    unredirectableError: boolean
    hash?: {
        error?: string | undefined;
        error_description?: string | undefined;
        state: string;
        code?: string | undefined;
        id_token?: string | undefined;
    }
}

export const Confirm = async (params: { redirectUrl: string, consentId: number, context: TestContext, consentParams: NewConsentParams }) => {
    return await Execute(params)
}

const Execute = async (params: { redirectUrl: string, consentId: number, context: TestContext, consentParams: NewConsentParams }, consentOptions?: ConsentConfirmationOptions) => {

    try {
        let options: ConsentConfirmationOptions;
        // apply defaults
        if (typeof consentOptions == 'undefined') {
            options = {
                username: params.context.environment.Config.TestData?.DefaultUsername || "no-username"
            }
        } else {
            options = _.clone(consentOptions);
        }
        options.checkboxSelections = ["Select all"]

        let userId = consentOptions?.username || params.consentParams.userId || "John"
        let rurl = new URL(params.redirectUrl);
        let scopes = rurl.searchParams.get("scope").split(" ")

        logger.debug(`TestDhConsentConfirmer: New consent with options: ${JSON.stringify(options)}`)

        let finalisedConsent = Promise.resolve().then(async () => {
            let dhEnv = params.context.environment.TestServices.mockDhServer;

            let MtlsAgent = params.context.environment.Util.MtlsAgent;

            let oAuthResult: string | {
                unredirectable: true
            }

            try {
                const response = await axios.request(MtlsAgent({
                    method: "GET",
                    url: params.redirectUrl,
                    responseType: "json",
                    headers: {
                        'x-simulate': 'true'
                    },

                }));
                oAuthResult = response.data;
            } catch (err) {
                if (err.isAxiosError && err.response.data.errors) {
                    oAuthResult = { unredirectable: true }
                }
            }

            // handle oAuth error
            if (typeof oAuthResult === "string") {
                return oAuthResult;
            }

            // handle unredirectable error
            if (oAuthResult.unredirectable) {
                return oAuthResult;
            }

            let dhConsentId = (<any>oAuthResult).dhConsentId;
            if (typeof dhConsentId !== "number") throw "Expected a number"

            let confirmResponse = await axios.request({
                method: "POST",
                url: urljoin(`http://localhost:${dhEnv.port}`, 'authorize/consent-flow', dhConsentId.toString()),
                responseType: "json",
                data: qs.stringify({
                    userId,
                    scopes: JSON.stringify(scopes)
                }),
                headers: {
                    'x-simulate': 'true'
                }
            });

            let confirmResult: string | {
                unredirectable: true
            } = confirmResponse.data;

            if (typeof confirmResult === "string") {
                return confirmResult;
            }

            // handle unredirectable error
            if (confirmResult.unredirectable) {
                return confirmResult;
            }

            return confirmResult;


        }).then(async (result: string | { unredirectable: true }) => {
            if (typeof result === 'string') {
                let qs_encoded = result.substring(result.indexOf("#") + 1)
                let parts: {
                    error?: string
                    error_description?: string
                    state: string
                    code?: string
                    id_token?: string
                } = <any>qs.parse(qs_encoded);

                // return the OAuthResponse directly if there is an oAuth error
                if (!(typeof parts.code == 'string' && typeof parts.id_token == 'string')) {
                    logger.debug('id_token response contains error or is malformed', parts)
                    return {
                        unredirectableError: false,
                        hash: parts
                    }
                }

                logger.debug(`Received OAuth Result: ${JSON.stringify(parts)}`)

                return {
                    hash: parts,
                    unredirectableError: false
                };

            } else {
                logger.debug("Unredirecable error")
                return {
                    unredirectableError: true
                }
            }

        })

        await finalisedConsent;

        logger.info("TestDhConsentConfirmer: Success")

        return await finalisedConsent;
    } catch (err) {
        logger.info("TestDhConsentConfirmer: Error")
        throw err;
    } finally {
        logger.info("TestDhConsentConfirmer: Cleaning up")
        logger.debug('Setting AUTH_FLOW_COMPLETED_SELECTOR')
    }
}