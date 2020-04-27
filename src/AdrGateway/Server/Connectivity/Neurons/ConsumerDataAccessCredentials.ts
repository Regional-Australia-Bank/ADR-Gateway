import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { ConsentRequestLog, ConsentRequestLogManager } from "../../../Entities/ConsentRequestLog";
import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import _ from "lodash"
import { injectable } from "tsyringe";
import { DataholderRegisterMetadata } from "./RegisterDataholders";
import { DataholderOidcResponse } from "./DataholderRegistration";


@injectable()
export class ConsumerDataAccessCredentialsNeuron extends Neuron<[DataholderRegisterMetadata,DataholderOidcResponse,ConsentRequestLog],{
    accessToken:string,
    certInjector:ClientCertificateInjector,
    dhMeta:DataholderRegisterMetadata,
    dhOidc:DataholderOidcResponse
}> {
    constructor(
        private cert:ClientCertificateInjector,
        private resourcePath?:string
    ) {
        super()
        // the cache will be disabled for access to the authorize endpoint.
        // TODO cache?
    }

    evaluator = async ([dhMeta,dhOidc,consent]:[DataholderRegisterMetadata,DataholderOidcResponse,ConsentRequestLog]) => {

        return {
            accessToken: consent.accessToken,
            certInjector: this.cert,
            dhMeta,
            dhOidc
        }
    }
}
