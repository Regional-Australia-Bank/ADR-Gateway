import _ from "lodash"

const OriginalDataRecipients = [
    {
        "legalEntityId": "test-legal-entity-id",
        "legalEntityName": "Test Data Recipient 1",
        "industry": "BANKING",
        "dataRecipientBrands": [
            {
                "dataRecipientBrandId": "test-data-recipient-1-brand-1",
                "brandName": "Brand 1",
                "industry": "BANKING",
                "logoUri": "string",
                "softwareProducts": [
                    {
                        "softwareProductId": "test-data-recipient-1-brand-1-product-1",
                        "softwareProductName": "Product 1",
                        "logoUri": "string",
                        "status": "ACTIVE",
                        "ssaParticulars": {
                            "client_description": "A mock software product for testing SSA",
                            "client_uri": "https://regaustbank.io",
                            "redirect_uris": [
                                "https://raw.githubusercontent.com/Regional-Australia-Bank/ADR-Gateway/master/examples/redirect-uri.html",
                                "https://regaustbank.io/redirect2"
                            ],
                            "tos_uri": "https://regaustbank.io/tos.html",
                            "policy_uri": "https://regaustbank.io/policy.html",
                            "jwks_uri": "https://regaustbank.io/jwks",
                            "revocation_uri": "https://regaustbank.io/revocation",
                            "scope": "bank:accounts.basic:read bank:accounts.detail:read bank:transactions:read bank:payees:read bank:regular_payments:read common:customer.basic:read common:customer.detail:read cdr:registration"
                        }
                    }
                ],
                "status": "ACTIVE"
            }
        ],

        "status": "ACTIVE",
        "lastUpdated": "2019-11-14T04:14:18Z",

    }
]

export let DataRecipients = _.cloneDeep(OriginalDataRecipients)

export const TestDataRecipientApplication = {
    BrandId: DataRecipients[0].dataRecipientBrands[0].dataRecipientBrandId,
    LegalEntityId: DataRecipients[0].legalEntityId,
    ProductId: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].softwareProductId,
    redirect_uris: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.redirect_uris,
    standardsVersion: 1,
    standardsVersionMinimum: 1,
    uris: {
        jwks_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.jwks_uri,
        logo_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].logoUri,
        policy_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.policy_uri,
        revocation_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.revocation_uri,
        tos_uri: DataRecipients[0].dataRecipientBrands[0].softwareProducts[0].ssaParticulars.tos_uri
    }
}

let dataRecipientBase:string = "";

export const SetDataRecipientBaseUri = (recipient_base_uri:string) => {
    dataRecipientBase = recipient_base_uri
}

export const GetDataRecipientBaseUri = () => {
    return dataRecipientBase
}