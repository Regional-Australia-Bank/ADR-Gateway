import puppeteer, { Browser, ElementHandle } from "puppeteer";
import _ from "lodash";
import moment from "moment";
import { TestContext } from "../Framework/TestContext";
import { ConsentConfirmer } from "./ConsentConfirmer";
import child_process from "child_process"
import qs from "qs"
import { param } from "express-validator";
import urljoin from "url-join";
import { axios } from "../../../Common/Axios/axios";
import { logger } from "../../Logger";

const PuppeteerHar = require('puppeteer-har');

const MAX_CONSENT_FLOW_DURATION = 240000; // 240 seconds

enum DataholderFlowErrors {
    SERVICE_UNAVAILABLE = "Service unavailable or something. Try again"
}

export interface PuppeteerConfig {
    Identifiers: {
        auth: {
            waitSelectors: string[],
            id: string
            id_button: string
        },
        otp: {
            waitSelectors: string[],
            otp: string
            otp_button: string
        },
        accounts: {
            waitSelectors: string[],
            all_accounts: string
            select_accounts_next_button: string
        },
        confirmSharing: {
            waitSelectors: string[],
            button: string
        },
        unredirectableMatch?: {
            waitSelectors: string[],
        }
    };
}

interface ConsentConfirmationOptions{
    username:string,
    checkboxSelections?: string[]
}

class TestDhConsentConfirmer extends ConsentConfirmer {
    browser!:Browser;

    public Confirm = async (params: {redirectUrl: string, consentId: number, context: TestContext}) => {
        let tries:number = 0;
        for (let tries = 1; tries <= 1; tries++) {
            try {
                return await this.Execute(params);
            } catch (err) {
                throw err;
            }
        }
        throw `Failed after ${tries} tries`
    }

    private Execute = async (params: {redirectUrl: string, consentId: number, context: TestContext}, consentOptions?:ConsentConfirmationOptions) => {
        
        const AUTH_FLOW_COMPLETED_SELECTOR = 'window.__adr__authFlowCompleted'

        let preOtpOut:any = undefined;

        let PreOtpReceive = async () => {
            if (params.context.environment.Config.Automation?.PreOtpReceive) {
                try {
                    preOtpOut = child_process.execSync(params.context.environment.Config.Automation?.PreOtpReceive).toString('utf8').trim()
                } catch (e) {
                    throw e
                }
            } else {
                return;
            }
        };

        let OtpReceive = async () => {
            if (params.context.environment.Config.Automation?.OtpReceive) {
                let otp = child_process.execSync(params.context.environment.Config.Automation?.OtpReceive,{
                    env: {
                        'PRE_OTP_RESULT': preOtpOut
                    }
                }).toString('utf8').trim()
                
                return otp;
            } else {
                return;
            }
        };

        this.browser = await puppeteer.launch({
            headless: !!process.env.TEST_SUITE_HEADLESS,
            ignoreHTTPSErrors:true,
            args: ["--single-process"]
        });
        const [page] = await this.browser.pages();

        
        // record har file
        let har = undefined;
        if (params.context._evidencePath) {
            har = new PuppeteerHar(page);
            const harFile =`consent-confirm-${moment().format('YYYY-MM-DD hh-mm-ss a')}.har`;
            const harPath = require('path').join(params.context._evidencePath,harFile);
            logger.debug(`ConsentConfirmer: har at ${harFile}`)    
            await har.start({ path: harPath });
        }

        let waitPromises:Promise<any>[] = []

        try {
            let options:ConsentConfirmationOptions;
            // apply defaults
            if (typeof consentOptions == 'undefined')
            {
                options = {
                    username: params.context.environment.Config.TestData?.DefaultUsername || "no-username"
                }
            } else {
                options = _.clone(consentOptions);
            }
            if (typeof options.checkboxSelections == 'undefined') {
                options.checkboxSelections = ["Select all"]
            }

            logger.debug(`ConsentConfirmer: New consent with options: ${JSON.stringify(options)}`)  
    
            // Enter username and password
            await page.goto(params.redirectUrl);
            // START dh-specific handling

            // TODO move this config to the environment config
            let selectors = params.context.environment.Config.Automation!.Puppeteer.Identifiers

            let finalisedConsent = Promise.resolve().then(async () => {
                // type the otp if available
                let authIdForm = Promise.all(_.map(selectors.auth.waitSelectors,sel => page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${sel})`,{timeout:MAX_CONSENT_FLOW_DURATION})))

                let otp:string|undefined = undefined;

                let authFilled = authIdForm.then(PreOtpReceive).then(async () => {
                    // type the username
                    const username = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.auth.id})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                    if (username) await username.type(options.username);
    
                    const authButton =  (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.auth.id_button})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                    if (authButton) await authButton.click();
                }).then(OtpReceive).then((received) => {
                    otp = received
                })

                let otpFilled = new Promise(async (resolve,reject) => {
                    try {
                        await Promise.all(_.map(selectors.otp.waitSelectors,sel => page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${sel})`,{timeout:MAX_CONSENT_FLOW_DURATION})))

                        const otpInput = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.otp.otp})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                        if (otp && otpInput) {
                            await otpInput.type(otp);
                        }
        
                        const otpButton = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.otp.otp_button})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                        if (otpButton) await otpButton.click();    
                    } catch (e) {
                        logger.error(e)
                    } finally {
                        resolve()
                    }
                })

                let accountsSelected = new Promise(async (resolve,reject) => {
                    try {
                        await Promise.all(_.map(selectors.accounts.waitSelectors,sel => page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${sel})`,{timeout:MAX_CONSENT_FLOW_DURATION})))

                        const allAccountsBox = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.accounts.all_accounts})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                        if (allAccountsBox) await allAccountsBox.click();
        
                        const nextButton = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.accounts.select_accounts_next_button})`,{timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                        if (nextButton) await nextButton.click();
                    } catch (e) {
                        logger.error(e)
                    } finally {
                        resolve()
                    }
                })

                let consentConfirmed = new Promise(async (resolve,reject) => {
                    try {
                        await Promise.all(_.map(selectors.confirmSharing.waitSelectors,sel => page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${sel})`,{timeout:MAX_CONSENT_FLOW_DURATION-10})))

                        const confirmSharingButton = (await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${selectors.confirmSharing.button})`,{polling: 500, timeout:MAX_CONSENT_FLOW_DURATION})).asElement()!;
                        if (confirmSharingButton) await confirmSharingButton.click();    
                    } catch (e) {
                        // logger.error(e)
                    } finally {
                        resolve()
                    }
                })

                let oauthFlowResult:Promise<string> = new Promise(async (resolve,reject) => {
                    try {
                        const oAuthResultSelector = `
                        ( /[#&]error=[^#]+/.test(document.location.hash) || (
                            /[#&]code=[^#]+/.test(document.location.hash) && /[#&]id_token=[^#]+/.test(document.location.hash)
                        ) ) && /[#&]state=[^#]+/.test(document.location.hash) && document.location.hash
                    `;
                        logger.debug('Waiting for AUTH_FLOW_COMPLETED_SELECTOR')
                        const finalRequest = await page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${oAuthResultSelector})`,{timeout:MAX_CONSENT_FLOW_DURATION, polling: "raf"})
                        logger.debug('Got AUTH_FLOW_COMPLETED_SELECTOR')

                        let hash = await finalRequest.jsonValue();
                        if (typeof hash == 'string') {
                            resolve(hash);
                        } else {
                            throw 'hash is not a string'
                        }
                    } catch (e) {
                        logger.debug('AUTH_FLOW_COMPLETED_SELECTOR')
                        reject(e)
                    }
                })

                if (!(selectors.unredirectableMatch?.waitSelectors && selectors.unredirectableMatch.waitSelectors.length > 0)) {
                    throw 'No unredirectableMatch.waitSelectors'
                }
                let unredirectableErrorResult:Promise<{unredirectable:true}> = new Promise((resolve,reject) => {
                    const unredirectableMatch = Promise.all(_.map(selectors.unredirectableMatch?.waitSelectors,sel => page.waitForFunction(`(${AUTH_FLOW_COMPLETED_SELECTOR}) || (${sel})`,{timeout:MAX_CONSENT_FLOW_DURATION-10})))
                    unredirectableMatch.then(() => {resolve({unredirectable:true})}).catch(reject)
                })

                waitPromises = [authFilled, otpFilled, accountsSelected, consentConfirmed, oauthFlowResult,unredirectableErrorResult]

                let race = new Promise((resolve) => {
                    oauthFlowResult.then(resolve,() => logger.error); // us logger.error to prevent unhandled promise rejection
                    unredirectableErrorResult.then(resolve).catch(err => {
                        // occasionally the unredirectableErrorResult waiter may throw an error because document.body is null sometime during tear-down. Just ignore it.
                        logger.error(err);
                    });
                })

                return await race;

            }).then(async (result:string|{unredirectable:true}) => {
                if (typeof result === 'string') {
                    let qs_encoded = result.substring(1)
                    let parts:{
                        error?:string
                        error_description?:string
                        state:string
                        code?:string
                        id_token?:string
                    } = <any>qs.parse(qs_encoded);
    
                    // return the OAuthResponse directly if there is an oAuth error
                    if (!(typeof parts.code == 'string' && typeof parts.id_token == 'string'))
                    {
                        logger.debug('id_token response contains error or is malformed',parts)
                        return {
                            unredirectableError:false,
                            hash:parts
                        }
                    } 
    
                    // otherwise, finalise the consent on the client side
                    let url = urljoin(params.context.environment.SystemUnderTest.AdrGateway().BackendUrl,"cdr/consents",params.consentId.toString())
    
                    let response = await axios.request(params.context.environment.Util.TlsAgent({
                        method:"patch",
                        url,
                        data: parts,
                        responseType: "json"
                    }))
    
                    // if scope was not finalised properly, throw an error
                    if (!response.data.scopesFulfilled) {
                        throw {error: "missing scopes", response: response.data}
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

            logger.info("ConsentConfirmer: Success")

            return await finalisedConsent;
        } catch (err) {
            logger.info("ConsentConfirmer: Error")
            throw err;
        } finally {
            logger.info("ConsentConfirmer: Cleaning up")
            logger.debug('Setting AUTH_FLOW_COMPLETED_SELECTOR')
            await page.evaluate(`${AUTH_FLOW_COMPLETED_SELECTOR} = true`)
            await Promise.all(_.map(waitPromises, p => p.then(logger.debug,logger.debug))) // Assuming that if we don't wait for them all, some waitSelectors may hang
            if (har?.stop) {
                await har.stop().catch(logger.error);
            }
            await page.close().catch().then(() => this.browser.close())
        }
    
    }

    public CleanUp = async () => {}
}

export {TestDhConsentConfirmer}