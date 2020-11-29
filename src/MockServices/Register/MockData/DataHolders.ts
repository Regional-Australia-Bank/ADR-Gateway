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


    results.push([badBank,inactiveBank])


    return _.flatten(results);
}