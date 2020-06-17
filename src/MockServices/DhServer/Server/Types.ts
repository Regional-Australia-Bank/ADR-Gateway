import { GatewayRequest, GatewayContext } from "../../../Common/Server/Types";
import { Consent } from "../Entities/Consent";

interface DhGatewayRequest {
    gatewayContext: DhGatewayContext
}

interface DhGatewayContext extends GatewayContext {
    consent: Consent
}

export {DhGatewayRequest}