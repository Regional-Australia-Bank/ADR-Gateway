import express from "express";
import { NextFunction } from "connect";
import { injectable, inject } from "tsyringe";
import winston from "winston";
import { ConsentRequestLogManager, ConsentRequestLog } from "../../../Common/Entities/ConsentRequestLog";
import { Schema, validationResult, matchedData, checkSchema, query } from "express-validator";
import { DataHolderMetadataProvider, DataholderMetadata } from "../../../Common/Services/DataholderMetadata";
import _ from "lodash";
import { AdrGatewayConfig } from "../../Config";

const querySchema:Schema = {
    systemId: { isString: { errorMessage: "systemId must be a string" }, isLength: {options: {min: 1}, errorMessage: "systemId must be at least length 1"} },
};

interface UserParams {
    systemId: string,
    userId: string,
}

enum ConsentType {
    TIME_BOUND = "TIME_BOUND",
    ONE_TIME = "ONE_TIME"
}

export const SerializeConsentDetails = async (c:ConsentRequestLog, dataHolderMetadataProvider: DataHolderMetadataProvider<DataholderMetadata>) => {
    try {
    let rendered = {
        consentId: c.id,
        arrangementId: c.arrangementId,
        consentType: (c.requestedSharingDuration === 0 ? ConsentType.ONE_TIME: ConsentType.TIME_BOUND),
        timeline: {
            sharingDuration: c.requestedSharingDuration,
            sharingEnd: c.sharingEndDate,
            consented: c.consentedDate, // TODO consider hiding token information
            requested: c.requestDate,
            revoked: c.revocationDate,
            revocationPropagated: c.revocationPropagationDate,
        },
        softwareProduct: {
            productKey: c.productKey,
            softwareProductId: c.softwareProductId
        },
        dataHolder: _.pick(
            await dataHolderMetadataProvider.getDataHolder(c.dataHolderId),
            "dataHolderBrandId",
            "brandName",
            "logoUri",
            "websiteUri",
            "industry",
            "legalEntityName",
            "abn",
            "acn",
        ),
        scopes: {
            confirmed: JSON.parse(<string>c.confirmedScopesJson),
            requested: JSON.parse(<string>c.requestedScopesJson),
        },            
        status: {
            current: c.IsCurrent(),
            lifecycle: c.LifeCycleStatus()
        }
    };
    return rendered;
}
catch (err)
{
    console.log(`==========> caught exception in SerializeConsentDetails ${err}`)
    return null;
}
}

@injectable()
class ActiveConsentsListMiddleware {

    constructor(
        @inject("Logger") private logger: winston.Logger,
        @inject("DataHolderMetadataProvider") private dataHolderMetadataProvider: DataHolderMetadataProvider<DataholderMetadata>,
        private consentManager:ConsentRequestLogManager
    ) { }

    RenderConsent = async (c:ConsentRequestLog) => SerializeConsentDetails(c,this.dataHolderMetadataProvider)

    ListConsents = async (m:UserParams) => {
        let result = [];
        let consentCursor:ConsentRequestLog|undefined = undefined;
        console.log(`=====> m.systemId is ${m.systemId}`)
        while(true){
            console.log(`=====> before GetConsentsWithSharingGreaterThanToday`)
            let consent = await this.consentManager.GetConsentsWithSharingGreaterThanToday(m.systemId, consentCursor);
            console.log(`=====> after GetConsentsWithSharingGreaterThanToday`)
            if (!consent) break;
            console.log(`=====> consent.id is ${consent.id}`)
            consentCursor = consent;
            result.push(await this.RenderConsent(consent))
        }
    
        return result;
    }

    handler = () => {
        let validationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    
        let Responder = async (req:express.Request,res:express.Response) => {
    
            let m:UserParams = <any>matchedData(req);

            let consents:object[] = await this.ListConsents(m);
    
            // TODO do redirect instead of merely describing one

            
            if (consents.length > 0) {
                for (var i=0; i < consents.length; i++)
                {
                    console.log(`======> ${consents[i]}`)
                }
                return res.json(consents)          
            } else {
                console.log(`======> active consents return 404 not found []`)
                return res.status(404).json([])
            }
        };
    
        // decide whether to validate based on body or query parameters
        // TODO add client authorization
        return _.concat(
            [
                express.json()
            ],
            <any>checkSchema(querySchema,['query']),
            [
                validationErrorMiddleware,
                Responder
            ])
    }

}

export {ActiveConsentsListMiddleware}