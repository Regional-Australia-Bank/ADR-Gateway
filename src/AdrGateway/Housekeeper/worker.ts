import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import winston = require("winston");
import express from "express";
import { JWKS } from "jose";
import { AdrServerConfig } from "../../AdrServer/Server/Config";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Common/Entities/ConsentRequestLog";
import moment from "moment"
import _ from "lodash";
import { DefaultConnector } from "../../Common/Connectivity/Connector.generated";

@injectable()
export class AdrHousekeeper {
    // taskTimings:{fn: (...args:any) => Promise<void>, lastStart?:Date}[] = []

    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentRequestLogManager,
        private connector:DefaultConnector,
    ) {}

    OnInterval = async (task:string,fn: () => Promise<void>,amount:number,unit:"hours"|"minutes"|"seconds") => {
        this.logger.info({
            message: "Housekeeper will run task on interval",
            meta: {
                task,
                amount,
                unit
            }
        })
        
        while (true) {
            let lastStart = moment().toDate()
            let nextStart = moment(lastStart).add(amount,unit);
            this.logger.info({
                message: "OnInterval task started",
                meta: {
                    task,
                    amount,
                    unit
                },
                // date: moment().toISOString()
            })
            try {
                await fn.apply(this);
            } catch (e) {
                this.logger.error({
                    message: "OnInterval task failed",
                    meta: {
                        task,
                        amount,
                        unit
                    },
                    // date: moment().toISOString(),
                    error: e
                })
            }
            let now = moment()
            if (nextStart.isSameOrBefore(now)) {
                continue;
            }
            let waitMilliseconds = nextStart.diff(now,'milliseconds')
            this.logger.info({
                message: "OnInterval waiting for next execution",
                meta: {
                    task,
                    amount,
                    unit
                },
                // date: moment().toISOString(),
                waitMilliseconds,
                nextStart: nextStart.toISOString()
            })
            await new Promise(resolve => setTimeout(resolve,waitMilliseconds))
        }

    }

    PropagateConsents = async () => {
        let brokenDataholders:string[] = []

        let consentCursor:ConsentRequestLog|undefined = undefined;

        while (true) {
            let consent = await this.consentManager.NextRevocationToPropagate(consentCursor)
            if (!consent) break;
            consentCursor = consent;
            this.logger.debug({message:"PropagateConsents: Consent revocation to propagate", meta: consent, date: moment().toISOString()})

            if (_.find(brokenDataholders,dh => dh ==consent.dataHolderId)) {
                // if there has been an error revoking consent at this data holder in this run, ignore this one
                this.logger.warn({message:"PropagateConsents: DH marked as broken. Skipping.", meta: consent, date: moment().toISOString()})
                continue;
            }
           
            try {
                await this.connector.PropagateRevokeConsent(consent).GetWithHealing()
                this.logger.debug({message:"PropagateConsents: Revoked consent", meta: consent, date: moment().toISOString()})
            } catch(e) {
                brokenDataholders.push(consent.dataHolderId)
                this.logger.error({message:"PropagateConsents: Could not propagate consent revocation", meta: consent, date: moment().toISOString()})
            }
            consent
        }
        this.logger.debug({message:"PropagateConsents: No more consents to propagate.", date: moment().toISOString()})
    }

    UpdateDataholderMeta = async () => {
        // Get the new brand metadata with the cache ignored during execution. This will internally update the cache.
        await this.connector.DataHolderBrands().GetWithHealing({ignoreCache:"top"})
        this.logger.info({message:"UpdateDataholderMeta: Success.", date: moment().toISOString()})
    }

    DynamicClientRegistration = async () => {
        // Get the new brand metadata with the cache ignored during execution. This will internally update the cache.

        let brands = await this.connector.DataHolderBrands().GetWithHealing()

        let config = await this.connector.AdrConnectivityConfig().GetWithHealing()

        let softwareProductIds = Object.keys(config.SoftwareProductConfigUris)
        this.logger.debug({message:`ClientRegistration: Planning.`, date: moment().toISOString(), brands, config, softwareProductIds})

        for (let softwareProductId of softwareProductIds) {
            for (let brand of brands) {
                try {
                    this.logger.debug({message:`ClientRegistration: Start. (${brand.dataHolderBrandId}: ${brand.brandName})`, date: moment().toISOString()})
                    await this.connector.CheckAndUpdateClientRegistration(softwareProductId,brand.dataHolderBrandId).GetWithHealing({ignoreCache:"all"})
                    this.logger.info({message:`ClientRegistration: Success. (${brand.dataHolderBrandId}: ${brand.brandName})`, date: moment().toISOString()})
                } catch (error) {
                    this.logger.error({error, message:`ClientRegistration: Error. (${brand.dataHolderBrandId}: ${brand.brandName})`, date: moment().toISOString()})
                }
            }    
        }

    }


    init(): any {
        setTimeout(() => {
            this.OnInterval("PropagateConsents",this.PropagateConsents,parseInt(process.env.HOUSE_KEEPER_INTERVAL_CONSENT_PROPAGATION || "5"),'minutes')
            this.OnInterval("UpdateDataholderMeta",this.UpdateDataholderMeta,parseInt(process.env.HOUSE_KEEPER_INTERVAL_UPDATE_DH_META || "360"),'minutes')
            this.OnInterval("DynamicClientRegistration",this.DynamicClientRegistration,parseInt(process.env.HOUSE_KEEPER_INTERVAL_DCR || "360"),'minutes')    
        },parseInt(process.env.HOUSE_KEEPER_STARTUP_DELAY || "60000"))
    }
}