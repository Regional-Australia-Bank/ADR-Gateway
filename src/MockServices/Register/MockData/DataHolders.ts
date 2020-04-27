export const DataHolders = async (mockDhBaseUri:string,mockDhSecureBaseUri:string) => [
    {
        "dataHolderBrandId": "test-data-holder-1",
        "brandName": "Test Data Holder 1",
        "industry": "BANKING",
        "legalEntity": {
            "legalEntityId": "legal-entity-id1",
            "legalEntityName": "string",
            "registrationNumber": "string",
            "registrationDate": "2019-10-24",
            "registeredCountry": "string",
            "abn": "string",
            "acn": "string",
            "arbn": "string",
            "industryCode": "string",
            "organisationType": "SOLE_TRADER"
        },
        "status": "ACTIVE",
        "endpointDetail": {
            "version": "string",
            "publicBaseUri": mockDhBaseUri,
            "resourceBaseUri": mockDhSecureBaseUri,
            "infosecBaseUri": mockDhBaseUri,
            "extensionBaseUri": "string",
            "websiteUri": "string"
        },
        "authDetails": [
            {
                "registerUType": "HYBRIDFLOW-JWKS",
                "jwksEndpoint": "string"
            }
        ],
        "lastUpdated": "2019-10-24T03:51:44Z"
    }
]