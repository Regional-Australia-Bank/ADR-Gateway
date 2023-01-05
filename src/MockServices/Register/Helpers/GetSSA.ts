import _ from "lodash"
import uuid from "uuid";
import moment from "moment";
import { JWT, JWK } from "jose";
import { Client } from "../Server/server";
import { MockRegisterConfig } from "../Server/Config";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { logger } from "../../MockLogger";
import { GetDataRecipientBaseUri } from "../MockData/DataRecipients";

export const GetSSA = async (dataRecipientBrandId:string, dataRecipientProductId:string, dataRecipients:any[], signingKey: JWK.Key, pw:DefaultConnector, clientProvider:(id:string) => Promise<Client>, configFn: () => Promise<MockRegisterConfig>):Promise<string> => {
    
    try {
        const dataRecipientBrands = _.filter(_.flatten(_.map(dataRecipients,dr=>dr.dataRecipientBrands)),brand => brand.dataRecipientBrandId == dataRecipientBrandId);    
        if (dataRecipientBrands.length != 1) throw {statusCode:403, errorMessage:"Expected exactly 1 matching dataRecipientBrand"};
        const dataRecipientBrand = dataRecipientBrands[0];
    
        const softwareProducts = _.filter(dataRecipientBrand.softwareProducts,p => p.softwareProductId == dataRecipientProductId);
        if (softwareProducts.length != 1) throw {statusCode:404, errorMessage:`Expected exactly 1 matching softwareProduct but I have ${softwareProducts.length} software products`};
        const softwareProduct = softwareProducts[0];            

        const claims = {
            iss: "cdr-register",
            exp: moment.utc().add(30,'minutes').unix(),
            iat: moment.utc().format(),
            jti: uuid.v4(),
            org_id: dataRecipientBrandId,
            org_name: dataRecipientBrand.brandName,
            client_name: softwareProduct.softwareProductName,
            client_description: softwareProduct.ssaParticulars.client_description,
            client_uri: softwareProduct.ssaParticulars.client_uri,
            redirect_uris: softwareProduct.ssaParticulars.redirect_uris,
            logo_uri: softwareProduct.logoUri,
            tos_uri: softwareProduct.ssaParticulars.tos_uri,
            policy_uri: softwareProduct.ssaParticulars.policy_uri,
            jwks_uri: softwareProduct.ssaParticulars.jwks_uri,
            revocation_uri: softwareProduct.ssaParticulars.revocation_uri,
            recipient_base_uri: GetDataRecipientBaseUri(),
            software_id: dataRecipientProductId,
            software_roles: "data-recipient-software-product",
            scope: softwareProduct.ssaParticulars.scope
        }
        try {
            let testClient = await clientProvider(dataRecipientBrandId)
            if (testClient.clientId == claims.software_id) {
                claims.jwks_uri = testClient.jwksUri
            }
        } catch(e) {
            logger.error(e)
        }
        return JWT.sign(claims,signingKey);
    } catch (e) {
        // could not find matching data recipient, so let's forward to actual register
        try {
            let config = await configFn();
            if (config.LiveRegisterProxy.BrandId) {
                return await pw.SoftwareStatementAssertion(dataRecipientProductId).GetWithHealing();
            } else {
                throw "No Live Register configured"
            }

        } catch (e2) {
            throw e;
        }
    }

}