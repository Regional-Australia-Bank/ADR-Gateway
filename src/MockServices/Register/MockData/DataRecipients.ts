import _ from "lodash"

const OriginalDataRecipients = [
    {
        "legalEntityId": "test-data-recipient",
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
                            "client_uri": "https://www.mockcompany.com.au",
                            "redirect_uris": [
                                "https://www.mockcompany.com.au/redirects/redirect1",
                                "https://www.mockcompany.com.au/redirects/redirect2"
                            ],
                            "tos_uri": "https://www.mockcompany.com.au/tos.html",
                            "policy_uri": "https://www.mockcompany.com.au/policy.html",
                            "jwks_uri": "https://localhost:9101/jwks",
                            "revocation_uri": "https://www.mockcompany.com.au/revocation",
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


export const SetMockDrStatus = (
    legalEntity: "ACTIVE" | "SUSPENDED" | "SURRENDERED" | "REVOKED",
    brand: "ACTIVE" | "REMOVED" | "INACTIVE",
    product: "ACTIVE" | "REMOVED" | "INACTIVE"
) => {
    let drs = _.cloneDeep(OriginalDataRecipients)
    drs[0].status = legalEntity;
    drs[0].dataRecipientBrands[0].status = brand,
    drs[0].dataRecipientBrands[0].softwareProducts[0].status = product
    DataRecipients = drs
}