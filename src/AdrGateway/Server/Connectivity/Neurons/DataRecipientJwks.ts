import { AdrConnectivityConfig } from "../../../Config";
import { injectable } from "tsyringe";
import {Length, IsUrl, MinLength, validate} from "class-validator";
import _ from "lodash"
import { DefaultCacheFactory } from "../Cache/DefaultCacheFactory";
import { JWKS } from "jose";

import { Neuron } from "../../../../Common/Connectivity/Neuron";
import { GetJwks } from "../../../../Common/Init/Jwks";

@injectable()
export class DataRecipientJwks extends Neuron<AdrConnectivityConfig,JWKS.KeyStore> {
    constructor() {
        super()
        this.cache = DefaultCacheFactory.Generate("DataRecipientJwks",{
            Serializer: (jwks) => JSON.stringify(jwks.toJWKS(true)),
            Deserializer: (s) => JWKS.asKeyStore(JSON.parse(s))
        }); // Use generic cache for the moment
        this.AddValidator(async (jwks) => {
            jwks.get({use:'sig',alg:'PS256'});
            return true;
        })
    }

    evaluator = async (c:AdrConnectivityConfig) => {return GetJwks(c)};
}

