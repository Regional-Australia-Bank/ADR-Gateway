import { E2ETestEnvironment } from "../Framework/E2ETestEnvironment";
import { axios } from "../../../Common/Axios/axios";
import _ from "lodash";
import { AdrConnectivityConfig } from "../../../Common/Config";
import { logger } from "../../Logger";

const AlgSets = [{
    id_token_encrypted_response_alg: "RSA-OAEP",
    id_token_encrypted_response_enc: "A128CBC-HS256",
},{
    id_token_encrypted_response_alg: "RSA-OAEP-256",
    id_token_encrypted_response_enc: "A256CBC-HS512",
},{
    id_token_encrypted_response_alg: "ECDH-ES+A128KW",
    id_token_encrypted_response_enc: "A256CBC-HS512"
}]

const GetAlternateAlgs = (registrationData:{id_token_encrypted_response_alg:string,id_token_encrypted_response_enc:string}) => {
    let newAlgSets = AlgSets.filter(s => s.id_token_encrypted_response_alg != registrationData.id_token_encrypted_response_alg);
    return newAlgSets
}

export const SwitchIdTokenAlgs = async (environment: E2ETestEnvironment) => {
    let cryptoAlgs:{
        id_token_encrypted_response_alg: string,
        id_token_encrypted_response_enc: string
    }[] | undefined = undefined;
    
    if (typeof environment.TestServices.adrGateway == 'undefined') throw 'AdrGateway service is undefined'

    let original_id_token_encrypted_response_alg:string|undefined;

    // add a new redirectUrl
    let configFn = environment.TestServices.adrGateway.connectivity.configFn;

    environment.TestServices.adrGateway.connectivity.configFn = async ():Promise<AdrConnectivityConfig> => {
        let origConfig = _.clone(await configFn());

        return {
            BrandId: origConfig.BrandId,
            LegalEntityId: origConfig.LegalEntityId,
            SoftwareProductConfigUris: origConfig.SoftwareProductConfigUris,
            UsePushedAuthorizationRequest: origConfig.UsePushedAuthorizationRequest,
            RegisterBaseUris: origConfig.RegisterBaseUris,
            Jwks: origConfig.Jwks,
            mtls: origConfig.mtls,
            Crypto: {
                PreferredAlgorithms: cryptoAlgs
            }
        }
    }

    // Create a new registration using the Connectivity framework
    const dataholder = environment.Config.SystemUnderTest.Dataholder;
    logger.debug(`Test new client registration with dataholder ${dataholder}`)

    let softwareProductId = await environment.OnlySoftwareProduct();
    let dependency = environment.TestServices.adrGateway?.connectivity.CheckAndUpdateClientRegistration(softwareProductId,dataholder);

    let interceptor = axios.interceptors.response.use(async res => {
        if (res.config.method == "get" && res.config.url && /register\/[^\/]+$/.test(res.config.url)) {
            original_id_token_encrypted_response_alg = res.data.id_token_encrypted_response_alg
            cryptoAlgs = GetAlternateAlgs(res.data)
        }
        return res;
    })

    try {
        // Get the current registration
        await dependency.Evaluate({ignoreCache:"all"});
        // This ^ will also populate a new configuration value for the desired id_token encryption algs

        // Evaluate again to update the registration
        await dependency.Evaluate({ignoreCache:"all"});

    } catch (e) {
    } finally {
        // reinstate the original configFn
        environment.TestServices.adrGateway.connectivity.configFn = configFn
        axios.interceptors.response.eject(interceptor)
    }

    return original_id_token_encrypted_response_alg;
}