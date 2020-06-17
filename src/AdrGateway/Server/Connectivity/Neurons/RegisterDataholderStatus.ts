import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { DataholderRegisterMetadata } from "./RegisterDataholders";
import { AdrConnectivityConfig } from "../../../Config";
import _ from "lodash"
import { Validator } from "class-validator";
import { NeuronFactory } from "../NeuronFactory";
import { axios } from "../../../../Common/Axios/axios";

class DataHolderDownError extends Error {
    constructor(public status:DataholderUpStatusResponse) {
        super()
    }
}

export interface DataholderUpStatusResponse {
    data: {
        status: "OK" | "PARTIAL_FAILURE" | "UNAVAILABLE" | "SCHEDULED_OUTAGE"
        explanation?: string,
        detectionTime: string,
        expectedResolutionTime: string,
        updateTime: string
    }
}

export type RegisterDataHolderStatus = "ACTIVE" | "INACTIVE" | "REMOVED"

export const DataHolderStatusNeurons = (nf:NeuronFactory) => {

    const AtRegister = nf.Simple(async (metadata: DataholderRegisterMetadata):Promise<RegisterDataHolderStatus> => {
        return <any>metadata.status
    }).AddValidator((status:RegisterDataHolderStatus) => {
        let valid = new Validator().isIn(status,["ACTIVE" , "INACTIVE" , "REMOVED"])
        if (!valid) throw 'Dataholder status at CDR register is not in list of expected values'
        return true;
    })
    
    const ActiveAtRegister = AtRegister.Assert(
        nf.Simple(async (status):Promise<boolean> => status == "ACTIVE")
            .AddValidator(up => up || (() => {throw 'Dataholder is not activated by the CDR Register'})()
        )
    )
    
    const UpAtDataholder = nf.Simple(async ([config,metadata]: [AdrConnectivityConfig,DataholderRegisterMetadata]):Promise<DataholderUpStatusResponse> => {
    
        // TODO reactivate status check
        let mockResponse:DataholderUpStatusResponse = <any>{
            data:{status:"OK"}
        }
        return mockResponse;

        let mtlsConfig = config.mtls || {}
        let options = _.merge({
            method: "GET",
            url: metadata.endpointDetail.publicBaseUri + '/v1/discovery/status',
            responseType: "json",
            headers: {
                "x-v": 1,
                "x-min-v": 1
            }
        },mtlsConfig)
    
        let response:DataholderUpStatusResponse = await axios.request(<any>options);
    
        return response;
    }).AddValidator(status => {
        let valid = new Validator().isIn(status.data.status,["OK" , "PARTIAL_FAILURE" , "UNAVAILABLE" , "SCHEDULED_OUTAGE"])
        if (!valid) throw new DataHolderDownError(status);
        return true;
    })
    
    const UpAndRunning = UpAtDataholder.Assert(
        nf.Simple(async (status: DataholderUpStatusResponse):Promise<boolean> => status.data.status == "OK")
            .AddValidator(up => up || (() => {throw 'Dataholder is not up'})()
        )
    )

    return {
        UpAndRunning,
        UpAtDataholder,
        ActiveAtRegister,
        AtRegister
    }
}

