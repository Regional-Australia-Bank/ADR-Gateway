import { spawnHttpsProxy } from "./proxy";
import { TestPKI, KeyAndCert } from "../Tests/EndToEnd/Helpers/PKI";
import _ from "lodash"
import fs from "fs"
import { MockInfrastructureConfig, TlsConfig } from "./Config";

export const SpawnProxies = async (config: MockInfrastructureConfig, tlsConfig:TlsConfig, mtlsConfig:TlsConfig) => {

    const spawn = spawnHttpsProxy.bind(undefined,config,tlsConfig)
    const spawnMTLS = spawnHttpsProxy.bind(undefined,config,mtlsConfig)

    spawn("AdrGatewayPublicProtected", 10101, 8101);
    spawn("AdrGatewayInternal", 9101, 8101);
    spawn("AdrServerPublic", 9102, 8102);
    spawn("DhServerPublicProtected", 10201, 8201);
    spawnMTLS("DhServerMtlsPublicProtected", 10202, 8201);
    spawn("DhServerInternal", 9201, 8201);
    spawn("MockRegister", 9301, 8301);

}