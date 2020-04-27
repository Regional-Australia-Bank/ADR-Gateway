import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import winston = require("winston");
import express from "express";
import { JWKS } from "jose";
import { AdrServerConfig } from "../../AdrServer/Server/Config";
import { ConsentRequestLogManager } from "../Entities/ConsentRequestLog";
import { DefaultPathways } from "../Server/Connectivity/Pathways";
import moment from "moment"
import _ from "lodash";
import { NO_CACHE_LENGTH } from "../../Common/Connectivity/Neuron";

@injectable()
export class AdrHousekeeper {
    // taskTimings:{fn: (...args:any) => Promise<void>, lastStart?:Date}[] = []

    constructor(
        @inject("Logger") private logger:winston.Logger,
        private consentManager:ConsentRequestLogManager,
        private pw:DefaultPathways,
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
                date: moment().toISOString()
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
                    date: moment().toISOString(),
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
                date: moment().toISOString(),
                waitMilliseconds,
                nextStart
            })
            await new Promise(resolve => setTimeout(resolve,waitMilliseconds))
        }

    }

    PropagateConsents = async () => {
        let brokenDataholders:string[] = []

        while (true) {
            let consent = await this.consentManager.NextRevocationToPropagate()
            if (!consent) break;
            this.pw.logger.debug({message:"PropagateConsents: Consent revocation to propagate", meta: consent, date: moment().toISOString()})

            if (_.find(brokenDataholders,dh => dh ==consent.dataHolderId)) {
                // if there has been an error revoking consent at this data holder in this run, ignore this one
                this.pw.logger.info({message:"PropagateConsents: DH marked as broken. Skipping.", meta: consent, date: moment().toISOString()})
                continue;
            }
           
            try {
                await this.pw.PropagateRevokeConsent(consent).GetWithHealing()
            } catch(e) {
                brokenDataholders.push(consent.dataHolderId)
                this.pw.logger.error({message:"PropagateConsents: Could not propagate consent revocation", meta: consent, date: moment().toISOString()})
            }
            consent
        }
        this.pw.logger.info({message:"PropagateConsents: No consents to propagate.", date: moment().toISOString()})
    }

    UpdateDataholderMeta = async () => {
        // Get the new brand metadata with the cache ignored during execution. This will internally update the cache.
        await this.pw.DataHolderBrands().Evaluate(undefined,{cacheIgnoranceLength:NO_CACHE_LENGTH})
        this.pw.logger.info({message:"UpdateDataholderMeta: Success.", date: moment().toISOString()})
    }

    init(): any {
        this.OnInterval("PropagateConsents",this.PropagateConsents,1,'minutes')
        this.OnInterval("UpdateDataholderMeta",this.UpdateDataholderMeta,30,'minutes')
    }
}