import _ from "lodash"
import uuid from "uuid";
import moment from "moment";
import { JWT, JWK } from "jose";
import { DefaultPathways } from "../../../AdrGateway/Server/Connectivity/Pathways";
import { Client } from "../Server/server";

export const GetSSA = async (dataRecipientBrandId:string, dataRecipientProductId:string, dataRecipients:any[], signingKey: JWK.Key, pw:DefaultPathways, clientProvider:(id:string) => Promise<Client>):Promise<string> => {
    
    try {
        const dataRecipientBrands = _.filter(_.flatten(_.map(dataRecipients,dr=>dr.dataRecipientBrands)),brand => brand.dataRecipientBrandId == dataRecipientBrandId);    
        if (dataRecipientBrands.length != 1) throw {statusCode:403, errorMessage:"Expected exactly 1 matching dataRecipientBrand"};
        const dataRecipientBrand = dataRecipientBrands[0];
    
        const softwareProducts = _.filter(dataRecipientBrand.softwareProducts,p => p.softwareProductId == dataRecipientProductId);
        if (softwareProducts.length != 1) throw {statusCode:404, errorMessage:"Expected exactly 1 matching softwareProduct"};
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
            software_id: dataRecipientProductId,
            software_roles: "data-recipient-software-product",
            scope: softwareProduct.ssaParticulars.scope
        }
        try {
            let testClient = await clientProvider(dataRecipientBrandId)
            if (testClient.clientId == claims.org_id) {
                claims.jwks_uri = testClient.jwksUri
            }
        } catch(e) {
            console.error(e)
        }
        return JWT.sign(claims,signingKey);
    } catch (e) {
        // could not find matching data recipient, so let's forward to actual register
        try {
            return await pw.SoftwareStatementAssertion(dataRecipientProductId).GetWithHealing();
        } catch (e2) {
            throw e;
        }
    }

}