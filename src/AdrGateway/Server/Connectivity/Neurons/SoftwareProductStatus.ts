import { AdrConnectivityConfig } from "../../../Config";
import { injectable } from "tsyringe";
import { Neuron } from "../../../../Common/Connectivity/Neuron";

export interface SoftwareProductStatus {}

@injectable()
export class GetSoftwareProductStatusNeuron extends Neuron<AdrConnectivityConfig,SoftwareProductStatus> {
    constructor() {
        super()
        this.cache; // Use generic cache for the moment
    }

    evaluator = async () => {
        return {}
    }

    // TODO add validator
}