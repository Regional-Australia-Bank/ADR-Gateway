import { EndToEndTestingConfig, Deparameterize, InTestConfigBase, ServiceDefinitionParameterized } from "../Environments"
import { Server } from "http";
import { createConnection, Connection } from "typeorm";
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
import { DhServerConfig } from "../../../MockServices/DhServer/Server/Config";
import { DhServerStartup } from "../../../MockServices/DhServer/Server/startup";
import _ from "lodash"
import { ConsentRequestLogManager } from "../../../Common/Entities/ConsentRequestLog";
import winston from "winston";
import { TestPKI } from "../Helpers/PKI";
import { CertsFromFilesOrStrings } from "../../../Common/SecurityProfile/Util";
import { MockSoftwareProductServerStartup } from "../../../MockServices/SoftwareProduct/Server/startup";
import { MockSoftwareProductConfig } from "../../../MockServices/SoftwareProduct/Server/Config";
import { AdrJwksStartup } from "../../../AdrJwks/startup";
import { AdrJwksConfig } from "../../../AdrJwks/Config";
import { AxiosRequestConfig } from "axios";
import { DefaultClientCertificateInjector, MTLSInject, TLSInject } from "../../../Common/Services/ClientCertificateInjection";
import { DefaultConnector } from "../../../Common/Connectivity/Connector.generated";
import { SoftwareProductConnectivityConfig, AdrConnectivityConfig } from "../../../Common/Config";
import { logger } from "../../Logger";
import { BootstrapTempDb } from "../../../Common/Entities/Migrations/Bootstrap";
import moment from "moment";
import { SetDataRecipientBaseUri } from "../../../MockServices/Register/MockData/DataRecipients";

const getPort = require('get-port');

export class E2ETestEnvironment {
    private persistanceDb?: any;

    switches = {
        UseDhArrangementEndpoint: true
    }

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
                logger.warn(`Could not load ${this.Name}_persistance.json`);
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
        if (typeof p === 'undefined' || p === null) {
            return () => {throw 'ServiceDefinition is undefined'}
        }

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

    OnlySoftwareProductConfig = async ():Promise<SoftwareProductConnectivityConfig> => {
        const softwareProduct = await this.OnlySoftwareProductKey()
        const softwareProductId = (await this.TestServices.adrGateway.connectivity.SoftwareProductConfigs().Evaluate()).byKey[softwareProduct].ProductId;
        return this.TestServices.adrGateway.connectivity.SoftwareProductConfig(softwareProductId).Evaluate()
    }

    OnlySoftwareProductId = async () => {
        const softwareProduct = await this.OnlySoftwareProductKey()
        const softwareProductId = (await this.TestServices.adrGateway.connectivity.SoftwareProductConfigs().Evaluate()).byKey[softwareProduct].ProductId;
        return softwareProductId;
    }

    OnlySoftwareProductKey = () => "sandbox"
    
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
        softwareProduct?: {port:number,server:Server}
        adrJwks?: {port:number,server:Server}
        adrGateway?: {port:number,server:Server,connectivity:DefaultConnector}
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
        SoftwareProduct: () => Promise<MockSoftwareProductConfig>
        AdrJwks: () => Promise<AdrJwksConfig>
        Connectivity: () => Promise<AdrConnectivityConfig>
        AdrGateway: () => Promise<Pick<AdrGatewayConfig,"BackEndBaseUri"|"Port"|"DefaultAPIVersion">>
        AdrServer: () => Promise<AdrServerConfig>
        MockDhServer: () => Promise<DhServerConfig>
    }

    logger: winston.Logger

    _clientCert: {key?:string|string[], cert?:string|string[],ca?: string|string[], passphrase?:string}

    constructor(testConfig:EndToEndTestingConfig) {
        this.Name = testConfig.Name
        this.Config = testConfig
        this.TestServices = {}

        this.logger = winston.createLogger()

        this.GetServiceDefinition = {
            Connectivity: this.PromiseFunctionify(this.Config.TestServiceDefinitions.Connectivity,async (config) => {
                let testingCerts = await TestPKI.TestConfig();
                config.mtls = config.mtls || {
                    ca: testingCerts.caCert,
                    key: testingCerts.client.key,
                    cert: testingCerts.client.certChain,
                }
                
                config.SoftwareProductConfigUris = config.SoftwareProductConfigUris || {
                    sandbox: `http://localhost:${this.TestServices.softwareProduct?.port}/software.product.config`
                }

                config.RegisterBaseUris = config.RegisterBaseUris || {
                    Oidc: this.SystemUnderTest.Register().DiscoveryUri,
                    Resource: this.SystemUnderTest.Register().PublicUri,
                    SecureResource: this.SystemUnderTest.Register().SecureUri
                }

                config.UsePushedAuthorizationRequest = false;
                config.UseDhArrangementEndpoint = this.switches.UseDhArrangementEndpoint;      
                config.RegisterEndpointVersions = {
                    GetSoftwareStatementAssertion: "2"
                }

                return config;
            }),
            AdrGateway: <() => Promise<Pick<AdrGatewayConfig,"BackEndBaseUri"|"Port"|"DefaultAPIVersion">>> this.PromiseFunctionify(this.Config.TestServiceDefinitions.AdrGateway,async (config) => {
                if (typeof config.Port == 'undefined') {
                    config.Port = await getPort()
                }
                if (typeof config.BackEndBaseUri == 'undefined') {
                    config.BackEndBaseUri = `http://localhost:${config.Port}`   
                }
                if (typeof config.DefaultAPIVersion == 'undefined') {
                    config.DefaultAPIVersion =  {
                        getAccounts: 1,
                        getBulkBalance: 1,
                        getBalancesForSpecificAccount: 1,
                        getAccountBalance: 1,
                        getAccountDetail: 1,
                        getTransactionsForAccount: 1,
                        getTransactionDetail: 1,
                        getDirectDebitsForAccount: 1,
                        getBulkDirectDebits: 1,
                        getDirectDebitsForSpecificAccounts: 1,
                        getScheduledPaymentsForAccount: 1,
                        getScheduledPaymentsBulk: 1,
                        getScheduledPaymentsForSpecificAccount: 1,
                        getPayees: 1,
                        getPayeeDetail: 1,
                        getProduct: 1,
                        getProductDetail: 1,
                        getCustomer: 1,
                        getCustomerDetail: 1,
                        getStatus: 1
                    }   
                }
                return config;
            }),
            AdrServer: this.PromiseFunctionify(this.Config.TestServiceDefinitions.AdrServer),
            SoftwareProduct: this.PromiseFunctionify(this.Config.TestServiceDefinitions.SoftwareProduct,async (config) => {
                if (typeof config.Port == 'undefined') {
                    config.Port = await getPort()
                }
                return config;
            }),
            AdrJwks: this.PromiseFunctionify(this.Config.TestServiceDefinitions.AdrJwks),
            MockDhServer: this.PromiseFunctionify(this.Config.TestServiceDefinitions.MockDhServer)
        }
    }

    GetAdrPrivateJwks = async ():Promise<JWKS.KeyStore> => {
        return InTestConfigBase(async () => {
            let jwksy = (await this.GetServiceDefinition.Connectivity())
            if (typeof jwksy === 'undefined')  throw 'Cannot get JWKS on undefined AdrGateway'
            return await GetJwks(jwksy)
        })
    }

    Start = async () => {

        const proxyRoutes:{httpsPort:number, destination:string}[] = []

        const serviceDefinitions = this.Config.TestServiceDefinitions;

        // Start AdrDb
        if (serviceDefinitions.AdrDb) {
            if (serviceDefinitions.AdrDb === true) {
                // delete previous temporary dbs
                const rimraf = require("rimraf")
                rimraf.sync("tmp.*.sqlite")
                const tempFileName = "tmp."+moment().unix()+".sqlite"

                this.TestServices.adrDbConn = Promise.resolve(BootstrapTempDb(tempFileName))
            } else {
                this.TestServices.adrDbConn = Promise.resolve(await createConnection(<any>_.merge(EntityDefaults, serviceDefinitions.AdrDb)))
            }
        }

        // Start Mock Product
        this.TestServices.softwareProduct = await MockSoftwareProductServerStartup.Start(async () => {
            return await this.GetServiceDefinition.SoftwareProduct();
        })

        // Start Jwks Service
        if (serviceDefinitions.AdrJwks) {
            await this.GetServiceDefinition.AdrJwks();
            this.TestServices.adrJwks = await AdrJwksStartup.Start(this.GetServiceDefinition.AdrJwks)
        }

        // Start Mock Register
        if (serviceDefinitions.MockRegister) {
            if (typeof serviceDefinitions.MockRegister == 'function') {
                const clientProvider = async ():Promise<{clientId:string, jwksUri:string}> => {
                    const jwksUri = this.SystemUnderTest.AdrGateway().FrontEndUrls.JWKSEndpoint;
                    const clientId = (await this.GetServiceDefinition.SoftwareProduct()).ProductId;
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
            let configFn:() => Promise<AdrGatewayConfig> = async () => {
                
                let connConfig = await this.GetServiceDefinition.Connectivity();
                this._clientCert = connConfig.mtls
                let r = _.merge(await this.GetServiceDefinition.AdrGateway(),connConfig)
                return r;
            }
            let test = await configFn()
            this.TestServices.adrGateway = await AdrGatewayStartup.Start(configFn, this.TestServices.adrDbConn)
        }

        // Start Mock DhServer
        if (serviceDefinitions.MockDhServer) {
            this.TestServices.mockDhServer = await DhServerStartup.Start(this.GetServiceDefinition.MockDhServer)
        }

        // Start TestHttpsProxy for started services

        // Prepare mock PKI certs
        let mockCerts = await TestPKI.TestConfig()
        let tlsConfig = {
            key: CertsFromFilesOrStrings(mockCerts.server.key),
            cert: CertsFromFilesOrStrings(mockCerts.server.certChain),
            ca: CertsFromFilesOrStrings(mockCerts.caCert),
            requestCert: false
        }
    
        let mtlsConfig = {
            key: CertsFromFilesOrStrings(mockCerts.server.key),
            cert: CertsFromFilesOrStrings(mockCerts.server.certChain),
            ca: CertsFromFilesOrStrings(mockCerts.caCert),
            requestCert: true
        }

        if (serviceDefinitions.TestHttpsProxy) {
            this.TestServices.httpsProxy = this.TestServices.httpsProxy || {}
            if (this.TestServices.mockRegister) {
                console.log("Starting mock register")
                try {
                this.TestServices.httpsProxy.mockRegister = await TestHttpsProxy.Start(this.TestServices.mockRegister,tlsConfig)
                }
                catch (ex)
                {
                    console.log(`Mock register exception ${ex}`)
                }
            }
            if (this.TestServices.adrGateway) {
                console.log("Starting adrGateway")
                try {
                // TODO add configuration point for back end TLS server cert
                this.TestServices.httpsProxy.adrGateway = await TestHttpsProxy.Start(this.TestServices.adrGateway,tlsConfig)
                }
                catch (ex)
                {
                    console.log(`adrGateway exception ${ex}`)
                }
            }
            if (this.TestServices.adrServer) {
                console.log("Starting adrServer")
                try {
                // TODO add configuration point for front end TLS server cert
                this.TestServices.httpsProxy.adrServer = await TestHttpsProxy.Start(this.TestServices.adrServer,tlsConfig)
                }
                catch (ex)
                {
                    console.log(`adrServer exception ${ex}`)
                }
                SetDataRecipientBaseUri(`https://localhost:${this.TestServices.httpsProxy.adrServer.port}`)
            }
            if (this.TestServices.mockDhServer) {
                console.log("Starting mockDhServer")
                try {
                this.TestServices.httpsProxy.mockDhServer = await TestHttpsProxy.Start(this.TestServices.mockDhServer,tlsConfig)
                }
                    catch (ex)
                {
                console.log(`mockDhServer exception ${ex}`)
            }
            console.log("Starting mockDhServerMTLS")
                try {
                this.TestServices.httpsProxy.mockDhServerMTLS = await TestHttpsProxy.Start(this.TestServices.mockDhServer,mtlsConfig)
                }
                catch (ex)
                {
                    console.log(`mockDhServerMTLS exception ${ex}`)
                }
            }

        }

    }

    Stop = async () => {
        
        const PromiseToClose = (testService?: {server:Server}) => {
            return new Promise((resolve,reject) => {
                if (typeof testService?.server != 'undefined')
                testService.server.close((err) => {
                    if (err) reject(err);
                    resolve(null);
                })
            })
        }

        let httpsAdrGatewayClosed = PromiseToClose(this.TestServices.httpsProxy?.adrGateway)
        let httpsAdrServerClosed = PromiseToClose(this.TestServices.httpsProxy?.adrServer)
        let httpsMockDhServerClosed = PromiseToClose(this.TestServices.httpsProxy?.mockDhServer)
        let httpsMockDhServerMTLSClosed = PromiseToClose(this.TestServices.httpsProxy?.mockDhServerMTLS)
        let httpsMockRegisterClosed = PromiseToClose(this.TestServices.httpsProxy?.mockRegister)

        let adrServerClosed = PromiseToClose(this.TestServices.adrServer)
        let mockRegisterClosed = PromiseToClose(this.TestServices.mockRegister)
        let mockDhServerClosed = PromiseToClose(this.TestServices.mockDhServer)
        let adrGatewayClosed = PromiseToClose(this.TestServices.adrGateway)
        let mockSoftwareProductClosed = PromiseToClose(this.TestServices.softwareProduct)
        let adrJwksClosed = PromiseToClose(this.TestServices.adrJwks)

        let dbClosed = new Promise((resolve,reject) => {
            if (typeof this.TestServices.adrDbConn != 'undefined') {
                this.TestServices.adrDbConn.then(conn => conn.close().then(() => {
                    logger.debug("Closed database")
                    resolve(null)
                },(err) => {
                    logger.debug("Error closing database")
                    reject(err)
                }))
            } else {
                return Promise.resolve()
            }
        })

        await adrGatewayClosed;
        await adrServerClosed;
        await mockSoftwareProductClosed;
        await adrJwksClosed;
        await mockDhServerClosed;
        await mockRegisterClosed;

        await httpsAdrGatewayClosed;
        await httpsAdrServerClosed;
        await httpsMockDhServerClosed;
        await httpsMockDhServerMTLSClosed;
        await httpsMockRegisterClosed;

        await dbClosed;

        return;

    }

    async Mtls(o:any) {
        return await InTestConfigBase(async () => {
            let mtls = (await this.GetServiceDefinition.Connectivity()).mtls
            let inj = new DefaultClientCertificateInjector(mtls);
            o = inj.inject(o,null);
            return o                
        })
    }

    async Tls(o:any) {
        return await InTestConfigBase(async () => {
            let mtls = (await this.GetServiceDefinition.Connectivity()).mtls
            let inj = new DefaultClientCertificateInjector(mtls);
            o = inj.injectCa(o);
            return o                
        })
    }

    Util = {        
        MtlsAgent: (request:AxiosRequestConfig) => {
            return MTLSInject(request,this._clientCert)
        },
        TlsAgent: (request:AxiosRequestConfig) => {
            return TLSInject(request,this._clientCert)
        }
    }

}