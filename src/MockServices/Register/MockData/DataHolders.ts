import { Dictionary } from "../../../Common/Server/Types";
import _ from "lodash"
import { MockRegisterConfig } from "../Server/Config";
import { TestPKI } from "../../../Tests/EndToEnd/Helpers/PKI";
import { axios } from "../../../Common/Axios/axios";
import { DefaultClientCertificateInjector } from "../../../Common/Services/ClientCertificateInjection";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import uuid from "uuid";
import moment from "moment";

export const DataHolders = async (config:MockRegisterConfig,pw:DefaultConnector):Promise<any[]> => {

    let certs = await TestPKI.TestConfig();
    let mtls = new DefaultClientCertificateInjector({ca:certs.caCert});   
    let testDhUrls:Dictionary<string> = config.TestDataHolders;

    let promises:Promise<any[]>[] = [];
    let testDhs = Promise.all(_.map(Object.entries(testDhUrls), async ([id,url]) => {
        return await _.merge({
            "dataHolderBrandId": id
        },(await axios.get(url,mtls.inject({responseType:"json"}))).data)
    }))
    promises.push(testDhs)

    if (config.LiveRegisterProxy.BrandId) {
        promises.push(pw.DataHolderBrands().GetWithHealing());
    }
    
    let results = await Promise.all(promises)

    // Add a non-conformant payload to test robustness of DR. https://github.com/Regional-Australia-Bank/ADR-Gateway/issues/23
    const badBank = {
        "dataHolderBrandId": uuid.v4(),
        "brandName": "Bad bank",
        "industry": "banking",
        "logoUri": "https://bad.bank",
        "legalEntity": {
            "legalEntityId": uuid.v4(),
            "legalEntityName": "Bad bank",
            "logoUri": "https://bad.bank/logo",
            "abn": "1234567890"
        },
        "status": "ACTIVE",
        "authDetails": [],
        "lastUpdated": moment().utc().toISOString()
    }

    const inactiveBank = {
        "dataHolderBrandId": "inactive-bank",
        "brandName": "Bad bank",
        "industry": "banking",
        "logoUri": "https://bad.bank",
        "legalEntity": {
            "legalEntityId": uuid.v4(),
            "legalEntityName": "Bad bank",
            "logoUri": "https://bad.bank/logo",
            "abn": "1234567890"
        },
        "endpointDetails": {

        },
        "status": "INACTIVE",
        "authDetails": [],
        "lastUpdated": moment().utc().toISOString()
    }

    const realDhs = [
        {
          "dataHolderBrandId": "8c5bdd1b-aed9-40eb-8866-bfc5c1cfcae7",
          "brandName": "Westpac",
          "industry": "banking",
          "logoUri": "https://banking.westpac.com.au/wbc/banking/Themes/Default/Desktop/WBC/Core/Images/logo_white_bg.png.6c772a263bf42d99a2c098bf0739fc5b504ed28d.png",
          "legalEntity": {
            "legalEntityId": "25017347-3adb-4fd6-8e73-dbec8d627cbe",
            "legalEntityName": "Westpac Banking Corporation",
            "logoUri": "https://banking.westpac.com.au/wbc/banking/Themes/Default/Desktop/WBC/Core/Images/logo_white_bg.png.ce5c4c19ec61b56796f0e218fc8329c558421fd8.png",
            "abn": "33007457141",
            "acn": "007457141"
          },
          "status": "ACTIVE",
          "endpointDetail": {
            "publicBaseUri": "https://digital-api.westpac.com.au/",
            "resourceBaseUri": "https://cdr.api.westpac.com.au",
            "infosecBaseUri": "https://cdr.idp.westpac.com.au/identity",
            "websiteUri": "https://www.westpac.com.au/"
          },
          "authDetails": [
            {
              "registerUType": "SIGNED-JWT",
              "jwksEndpoint": "https://idp.westpac.com.au/identity/ext/oauth/obdr_jwks"
            }
          ],
          "lastUpdated": "2021-01-29T10:57:50Z"
        },
        {
          "dataHolderBrandId": "89d926e2-78e8-4249-b92a-6c3d36839fe2",
          "brandName": "NATIONAL AUSTRALIA BANK",
          "industry": "banking",
          "logoUri": "https://www.nab.com.au/etc/designs/nabrwd/clientlibs/images/logo.png",
          "legalEntity": {
            "legalEntityId": "9fc5dbfe-faf2-44ba-af92-9ab002b506f3",
            "legalEntityName": "NATIONAL AUSTRALIA BANK LIMITED",
            "logoUri": "https://www.nab.com.au/etc/designs/nabrwd/clientlibs/images/logo.png",
            "abn": "12 004 044 937",
            "acn": "004 044 9"
          },
          "status": "ACTIVE",
          "endpointDetail": {
            "publicBaseUri": "https://openbank.api.nab.com.au",
            "resourceBaseUri": "https://openbank-secure.api.nab.com.au",
            "infosecBaseUri": "https://openbank.api.nab.com.au",
            "websiteUri": "https://developer.nab.com.au"
          },
          "authDetails": [
            {
              "registerUType": "SIGNED-JWT",
              "jwksEndpoint": "https://openbank.api.nab.com.au/.well-known/keyset"
            }
          ],
          "lastUpdated": "2021-03-02T06:05:16Z"
        },
        {
          "dataHolderBrandId": "3150628b-cc24-40c6-be91-d599a1c35567",
          "brandName": "ANZ",
          "industry": "banking",
          "logoUri": "https://www.anz.com.au/content/dam/anzcomau/logos/anz/ANZ-MB-Logo-3rd-Party-RGB.png",
          "legalEntity": {
            "legalEntityId": "73dadf05-5cf3-4135-8941-31f24a288df1",
            "legalEntityName": "Australia and New Zealand Banking Group Limited",
            "logoUri": "https://www.anz.com.au/content/dam/anzcomau/logos/anz/ANZ-MB-Logo-3rd-Party-RGB.png",
            "abn": "11005357522",
            "acn": "005357522"
          },
          "status": "ACTIVE",
          "endpointDetail": {
            "publicBaseUri": "https://api.anz",
            "resourceBaseUri": "https://cdr.api.anz",
            "infosecBaseUri": "https://unauth.cdr.api.anz",
            "websiteUri": "https://www.anz.com.au"
          },
          "authDetails": [
            {
              "registerUType": "SIGNED-JWT",
              "jwksEndpoint": "https://unauth.cdr.api.anz/cds-au/jwks"
            }
          ],
          "lastUpdated": "2021-03-02T06:05:06Z"
        },
        {
          "dataHolderBrandId": "7c356d3d-ff7d-49a5-b16e-3cffca4e49d3",
          "brandName": "CommBank",
          "industry": "banking",
          "logoUri": "https://www.commbank.com.au/content/dam/commbank-assets/cba-stacked.jpg",
          "legalEntity": {
            "legalEntityId": "fc428f71-847c-4975-8dd6-e3f2cfdaafd0",
            "legalEntityName": "Commonwealth Bank of Australia",
            "logoUri": "https://www.commbank.com.au/content/dam/commbank-assets/cba-stacked.jpg",
            "abn": "48123123124"
          },
          "status": "ACTIVE",
          "endpointDetail": {
            "publicBaseUri": "https://api.commbank.com.au/public",
            "resourceBaseUri": "https://secure.api.commbank.com.au/api",
            "infosecBaseUri": "https://api.commbank.com.au/infosec",
            "websiteUri": "https://www.commbank.com.au"
          },
          "authDetails": [
            {
              "registerUType": "SIGNED-JWT",
              "jwksEndpoint": "https://api.commbank.com.au/infosec/.well-known/openid-configuration/jwks"
            }
          ],
          "lastUpdated": "2021-03-02T05:59:45Z"
        },
        {
          "dataHolderBrandId": "bb91c794-e92e-4f9c-ba03-d83dea29fca7",
          "brandName": "Regional Australia Bank",
          "industry": "banking",
          "logoUri": "https://www.regionalaustraliabank.com.au/-/media/CommunityMutual/Images/Logo/regional-australia-bank-primary-logo.png",
          "legalEntity": {
            "legalEntityId": "d4c2167c-03dc-4ba2-a03d-55aa34632e5e",
            "legalEntityName": "Regional Australia Bank Ltd.",
            "logoUri": "https://www.regionalaustraliabank.com.au/-/media/CommunityMutual/Images/Logo/regional-australia-bank-primary-logo.png",
            "abn": "21087650360"
          },
          "status": "ACTIVE",
          "endpointDetail": {
            "publicBaseUri": "https://public-data.cdr.regaustbank.io",
            "resourceBaseUri": "https://secured-data.cdr.regaustbank.io",
            "infosecBaseUri": "https://idp.cdr.regionalaustraliabank.com.au/v1/rab-cdr",
            "extensionBaseUri": "https://secured-data.cdr.regaustbank.io",
            "websiteUri": "https://www.regionalaustraliabank.com.au/"
          },
          "authDetails": [
            {
              "registerUType": "SIGNED-JWT",
              "jwksEndpoint": "https://idp.cdr.regionalaustraliabank.com.au/v1/rab-cdr/jwks"
            }
          ],
          "lastUpdated": "2021-03-02T06:27:23Z"
        }
      ]
      


    results.push([badBank,inactiveBank])
    results.push(realDhs)

    return _.flatten(results);
}