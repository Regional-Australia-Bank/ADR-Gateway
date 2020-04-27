import { EndToEndTestingConfig, Deparameterize, InTestConfigBase, ServiceDefinitionParameterized } from "../Environments"
import { Server } from "http";
import { createConnection, Connection, ConnectionOptions } from "typeorm";
import { JWKS } from "jose";
import { GetJwks } from "../../../Common/Init/Jwks";
import { EntityDefaults } from "../../../AdrGateway/Server/Dependencies";
import { AdrServerStartup } from "../../../AdrServer/Server/startup";
import { MockRegisterServerStartup } from "../../../MockServices/Register/Server/startup";
import { TestHttpsProxy } from "../Helpers/TestHttpsProxy";
import fs from "fs"
import { AdrGatewayConfig } from "../../../AdrGateway/Config";
import { AdrServerConfig } from "../../../AdrServer/Server/Config";
import { AdrGatewayStartup } from "../../../AdrGateway/Server/startup";
import { DefaultPathways } from "../../../AdrGateway/Server/Connectivity/Pathways";
import { DhServerConfig } from "../../../MockServices/DhServer/Server/Config";
import { DhServerStartup } from "../../../MockServices/DhServer/Server/startup";
import _ from "lodash"
import { ConsentRequestLogManager } from "../../../AdrGateway/Entities/ConsentRequestLog";
import winston from "winston";
import https from "https"
import { TestPKI } from "../Helpers/PKI";
import { CertsFromFilesOrStrings } from "../../../Common/SecurityProfile/Util";
import { type } from "os";

const getPort = require('get-port');

export class E2ETestEnvironment {
    private persistanceDb?: any;

    PersistValue = async (key:string,value:string):Promise<void> => {
        let db = (await this.GetPersistedState()) || {}
        db[key] = value
        this.SavePersistedState()
    }

    GetPersistedValue = async (key:string):Promise<string> => {
        let db = (await this.GetPersistedState()) || {}
        if (typeof db[key] !== 'string') throw 'String does not exist'
        return db[key]
    }

    GetPersistedState = async ():Promise<any> => {
        if (this.persistanceDb) return this.persistanceDb

        await InTestConfigBase(async () => {
            try {
                this.persistanceDb = JSON.parse(fs.readFileSync(`${this.Name}_persistance.json`,{encoding:'utf8',flag:'r'}))
            } catch {
                console.warn(`Could not load ${this.Name}_persistance.json`);
                this.persistanceDb = {}
            }
        })

        if (this.persistanceDb) {
            return this.persistanceDb
        } else {
            throw 'Could not start persistance DB'
        }
    }

    SavePersistedState = async ():Promise<any> => {
        await InTestConfigBase(async () => {
            fs.writeFileSync(`${this.Name}_persistance.json`,JSON.stringify(this.persistanceDb),'utf8')
        })
    }


    ConsentRequestLogManager = ():ConsentRequestLogManager => {
        let connection = this.TestServices.adrDbConn
        if (!connection) throw 'No adrDbConn'
        return new ConsentRequestLogManager(connection,this.logger)
    }

    PromiseFunctionify = <Config>(p:ServiceDefinitionParameterized<Config>,filter?:(config:NonNullable<Config>) => Promise<NonNullable<Config>>):(() => Promise<NonNullable<Config>>) => {
        if (typeof p === 'undefined' || p === null) return () => {throw 'ServiceDefinition is undefined'}

        let configResolver:() => Promise<NonNullable<Config>>;

        if (typeof p === 'function') configResolver = () => {
            let result = p.bind(this,this)()
            if (typeof result === 'undefined') throw 'ServiceDefinition function returned undefined'
            return result;
        };

        else configResolver = () => <any>Promise.resolve(p);

        if (!filter) {
            return configResolver
        } else {
            return () => configResolver().then(filter)
        }
    }
    
    Config:EndToEndTestingConfig
    SystemUnderTest = {
        Register: () => Deparameterize(this,this.Config.SystemUnderTest.Register),
        AdrGateway: () => Deparameterize(this,this.Config.SystemUnderTest.AdrGateway,c => {
            if (!c.BackendUrl) {
                c.BackendUrl = `http://localhost:${this.TestServices.adrGateway?.port}`
            }

            return c;
        })
    }
    Name:string
    TestServices:{
        adrDbConn?: Promise<Connection>
        adrServer?: {port:number,server:Server}
        adrGateway?: {port:number,server:Server,connectivity:DefaultPathways}
        mockRegister?: {port:number,server:Server},
        mockDhServer?: {port:number,server:Server},
        httpsProxy?:{
            mockRegister?: {port:number,server:Server}
            adrServer?: {port:number,server:Server}
            adrGateway?: {port:number,server:Server}
            mockDhServer?: {port:number,server:Server}
            mockDhServerMTLS?: {port:number,server:Server}
        }
    }
    GetServiceDefinition: {
        AdrGateway: () => Promise<AdrGatewayConfig>
        AdrServer: () => Promise<AdrServerConfig>
        MockDhServer: () => Promise<DhServerConfig>
    }

    logger: winston.Logger

    constructor(testConfig:EndToEndTestingConfig) {
        this.Name = testConfig.Name
        this.Config = testConfig
        this.TestServices = {}

        this.logger = winston.createLogger()

        this.GetServiceDefinition = {
            AdrGateway: this.PromiseFunctionify(this.Config.TestServiceDefinitions.AdrGateway,async (config) => {
                if (typeof config.Port == 'undefined') {
                    config.Port = await getPort()
                }
                if (typeof config.BackEndBaseUri == 'undefined') {
                    config.BackEndBaseUri = `http://localhost:${config.Port}`   
                }
                let testingCerts = await TestPKI.TestConfig();
                config.mtls = config.mtls || {
                    ca: testingCerts.caCert,
                    key: testingCerts.client.key,
                    cert: testingCerts.client.certChain,
                }
                return config;
            }),
            AdrServer: this.PromiseFunctionify(this.Config.TestServiceDefinitions.AdrServer),
            MockDhServer: this.PromiseFunctionify(this.Config.TestServiceDefinitions.MockDhServer)
        }
    }

    GetAdrPrivateJwks = async ():Promise<JWKS.KeyStore> => {
        return InTestConfigBase(async () => {
            let jwksy = (await this.GetServiceDefinition.AdrGateway())
            if (typeof jwksy === 'undefined')  throw 'Cannot get JWKS on undefined AdrGateway'
            return GetJwks(jwksy)
        })
    }

    Start = async () => {

        const proxyRoutes:{httpsPort:number, destination:string}[] = []

        const serviceDefinitions = this.Config.TestServiceDefinitions;

        // Start AdrDb
        if (serviceDefinitions.AdrDb) {
            if (serviceDefinitions.AdrDb === true) {
                this.TestServices.adrDbConn = createConnection(<any>EntityDefaults)
            } else {
                this.TestServices.adrDbConn = createConnection(<any>_.merge(EntityDefaults, serviceDefinitions.AdrDb))
            }
        }

        // Start Mock Register
        if (serviceDefinitions.MockRegister) {
            if (typeof serviceDefinitions.MockRegister == 'function') {
                const clientProvider = async ():Promise<{clientId:string, jwksUri:string}> => {
                    const jwksUri = this.SystemUnderTest.AdrGateway().FrontEndUrls.JWKSEndpoint;
                    const clientId = (await this.GetServiceDefinition.AdrGateway()).DataRecipientApplication.BrandId
                    return {clientId,jwksUri}
                }
                this.TestServices.mockRegister = await MockRegisterServerStartup.Start(serviceDefinitions.MockRegister.bind(this,this),clientProvider)
            }
        }
        // Start AdrServer (depends on AdrDb)
        if (serviceDefinitions.AdrServer) {
            this.TestServices.adrServer = await AdrServerStartup.Start(this.GetServiceDefinition.AdrServer, this.TestServices.adrDbConn)
        }
        // Start AdrGateway (depends on AdrDb)
        if (serviceDefinitions.AdrGateway) {
            this.TestServices.adrGateway = await AdrGatewayStartup.Start(this.GetServiceDefinition.AdrGateway, this.TestServices.adrDbConn)
        }

        // Start Mock DhServer
        if (serviceDefinitions.MockDhServer) {
            this.TestServices.mockDhServer = await DhServerStartup.Start(this.GetServiceDefinition.MockDhServer)
        }

        // Start TestHttpsProxy for started services

        // Prepare server certs
        let tlsCerts = await TestPKI.TestConfig()
        let tlsConfig = {
            key: CertsFromFilesOrStrings(tlsCerts.server.key),
            cert: CertsFromFilesOrStrings(tlsCerts.server.certChain),
            ca: CertsFromFilesOrStrings(tlsCerts.caCert),
            requestCert: false
        }
    
        let mtlsConfig = {
            key: CertsFromFilesOrStrings(tlsCerts.server.key),
            cert: CertsFromFilesOrStrings(tlsCerts.server.certChain),
            ca: CertsFromFilesOrStrings(tlsCerts.caCert),
            requestCert: true
        }    


        if (serviceDefinitions.TestHttpsProxy) {
            this.TestServices.httpsProxy = this.TestServices.httpsProxy || {}
            if (this.TestServices.mockRegister) {
                this.TestServices.httpsProxy.mockRegister = await TestHttpsProxy.Start(this.TestServices.mockRegister,tlsConfig)
            }
            if (this.TestServices.adrGateway) {
                // TODO add configuration point for back end TLS server cert
                this.TestServices.httpsProxy.adrGateway = await TestHttpsProxy.Start(this.TestServices.adrGateway,tlsConfig)
            }
            if (this.TestServices.adrServer) {
                // TODO add configuration point for front end TLS server cert
                this.TestServices.httpsProxy.adrServer = await TestHttpsProxy.Start(this.TestServices.adrServer,tlsConfig)
            }
            if (this.TestServices.mockDhServer) {
                this.TestServices.httpsProxy.mockDhServer = await TestHttpsProxy.Start(this.TestServices.mockDhServer,tlsConfig)
                this.TestServices.httpsProxy.mockDhServerMTLS = await TestHttpsProxy.Start(this.TestServices.mockDhServer,mtlsConfig)
            }

        }

    }

    Stop = async () => {
        
        const PromiseToClose = (testService?: {server:Server}) => {
            return new Promise((resolve,reject) => {
                if (typeof testService?.server != 'undefined')
                testService.server.close((err) => {
                    if (err) reject(err);
                    resolve();
                })
            })
        }

        let adrServerClosed = PromiseToClose(this.TestServices.adrServer)
        let mockRegisterClosed = PromiseToClose(this.TestServices.mockRegister)
        let mockDhServerClosed = PromiseToClose(this.TestServices.mockDhServer)
        let adrGatewayClosed = PromiseToClose(this.TestServices.adrGateway)
        let httpsAdrGatewayClosed = PromiseToClose(this.TestServices.httpsProxy?.adrGateway)
        let httpsAdrServerClosed = PromiseToClose(this.TestServices.httpsProxy?.adrServer)
        let httpsMockDhServerClosed = PromiseToClose(this.TestServices.httpsProxy?.mockDhServer)
        let httpsMockDhServerMTLSClosed = PromiseToClose(this.TestServices.httpsProxy?.mockDhServerMTLS)
        let httpsMockRegisterClosed = PromiseToClose(this.TestServices.httpsProxy?.mockRegister)

        let dbClosed = new Promise((resolve,reject) => {
            if (typeof this.TestServices.adrDbConn != 'undefined') {
                this.TestServices.adrDbConn.then(conn => conn.close().then(resolve,reject))
            } else {
                return Promise.resolve()
            }
        })


        return await Promise.all([adrServerClosed,mockRegisterClosed,mockDhServerClosed,adrGatewayClosed,httpsAdrGatewayClosed,httpsAdrServerClosed,httpsMockRegisterClosed,httpsMockDhServerClosed,httpsMockDhServerMTLSClosed,dbClosed]);

    }

    async Mtls(o:any) {
        return await InTestConfigBase(async () => {
            let mtls = (await this.GetServiceDefinition.AdrGateway()).mtls
            o.httpsAgent = new https.Agent({
                cert: mtls.cert && CertsFromFilesOrStrings(mtls.cert),
                key: mtls.cert && CertsFromFilesOrStrings(mtls.key),
                ca: mtls.cert && CertsFromFilesOrStrings(mtls.ca),
                passphrase: mtls.passphrase,
                rejectUnauthorized: false // TODO from env
            })   
            return o                
        })
    }

}