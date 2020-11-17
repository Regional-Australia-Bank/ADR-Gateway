import { Dependency } from "./Dependency"
import * as util from "./Util"
import * as Types from "./Types"
import { injectable } from "tsyringe";
import { ClientCertificateInjector } from "../Services/ClientCertificateInjection";
import winston from "winston";
import { DataHolderRegistrationManager } from "../Entities/DataHolderRegistration";
import { ConsentRequestLogManager } from "../Entities/ConsentRequestLog";
import _ from "lodash"
import * as Serial from "./Cache/Serializers";


const Identifiers = {
  string: s => s,
  Types: {
    ConsentRequestLog: (x:Types.ConsentRequestLog) => x.id.toString(),
    ConsentRequestParams: (x:Types.ConsentRequestParams) => { throw 'Do not cache consent request'},
    StringOrUndefined: s => s
  }
}

@injectable()
export class DependencyGraph {
  constructor(
    public configFn:() => Promise<Types.AdrConnectivityConfig>,
    public cert:ClientCertificateInjector,
    public logger:winston.Logger,
    public dataholderRegistrationManager: DataHolderRegistrationManager,
    public consentManager:ConsentRequestLogManager,
  ) {
    
  }

  private MakeDependencies = () => {
    const factory = this;

    const AdrConnectivityConfig = new Dependency<{}, {}, Types.AdrConnectivityConfig>({
      name: "AdrConnectivityConfig",
      evaluator: factory.configFn,
      parameters: {},
      // disabledCaches: []
      cacheTrail: [],
      cache: {
        noCache: true
      },
    })

    const SoftwareProductConfigs = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig}, Types.IndexedSoftwareProductConfigs>({
      name: "SoftwareProductConfigs",
      evaluator: util.GetSoftwareProductConfigs,
      parameters: {},
      dependencies: [
        AdrConnectivityConfig
      ],
      // disabledCaches: []
      cacheTrail: [],
    })

    const SoftwareProductConfig = new Dependency<{SoftwareProductKey: Types.StringOrUndefined, SoftwareProductId: Types.StringOrUndefined}, {SoftwareProductConfigs: Types.IndexedSoftwareProductConfigs}, Types.SoftwareProductConnectivityConfig>({
      name: "SoftwareProductConfig",
      evaluator: util.GetSoftwareProductConfig,
      parameters: {
        SoftwareProductKey:Identifiers.Types.StringOrUndefined,
        SoftwareProductId:Identifiers.Types.StringOrUndefined
      },
      dependencies: [
        SoftwareProductConfigs
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,],
    })

    const DataRecipientJwks = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig}, Types.JWKS.KeyStore>({
      name: "DataRecipientJwks",
      evaluator: ({AdrConnectivityConfig}) => {return util.GetJwks(AdrConnectivityConfig)},
      validator: util.Validation.DataRecipientJwks,
      parameters: {},
      dependencies: [
        AdrConnectivityConfig
      ],
      // disabledCaches: []
      cacheTrail: [],
      serializer: Serial.JWKS,
    })

    const RegisterOidc = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig}, Types.RegisterOidcResponse>({
      name: "RegisterOidc",
      evaluator: util.GetRegisterOIDC.bind(undefined,factory.cert),
      parameters: {},
      dependencies: [
        AdrConnectivityConfig
      ],
      // disabledCaches: []
      cacheTrail: [],
      cache: {
        minAge: 3600
      },
    })

    const DataRecipientStatus = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig}, string>({
      name: "DataRecipientStatus",
      evaluator: util.DataRecipientStatus.bind(undefined,factory.cert),
      parameters: {},
      dependencies: [
        AdrConnectivityConfig
      ],
      // disabledCaches: []
      cacheTrail: [],
      cache: {
        minAge: 300
      },
    })

    const AssertDataRecipientIsActive = new Dependency<{}, {DataRecipientStatus: string}, void>({
      name: "AssertDataRecipientIsActive",
      evaluator: util.AssertDataRecipientActive,
      parameters: {},
      dependencies: [
        DataRecipientStatus
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientStatus,],
      cache: {
        noCache: true
      },
    })

    const SoftwareProductStatus = new Dependency<{SoftwareProductKey: string}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, SoftwareProductConfig: Types.SoftwareProductConnectivityConfig}, string>({
      name: "SoftwareProductStatus",
      evaluator: util.SoftwareProductStatus.bind(undefined,factory.cert),
      parameters: {
        SoftwareProductKey:Identifiers.string
      },
      dependencies: [
        AdrConnectivityConfig,
        SoftwareProductConfig
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,],
      cache: {
        minAge: 300
      },
    })

    const AssertSoftwareProductStatusIsActive = new Dependency<{SoftwareProductKey: string}, {SoftwareProductStatus: string, SoftwareProductConfig: Types.SoftwareProductConnectivityConfig}, void>({
      name: "AssertSoftwareProductStatusIsActive",
      evaluator: util.AssertSoftwareProductActive,
      parameters: {
        SoftwareProductKey:Identifiers.string
      },
      dependencies: [
        SoftwareProductStatus,
        SoftwareProductConfig
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,],
      cache: {
        noCache: true
      },
    })

    const RegisterAccessCredentials = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, RegisterOidc: Types.RegisterOidcResponse, AssertDataRecipientIsActive: void}, Types.AccessToken>({
      name: "RegisterAccessCredentials",
      evaluator: util.GetRegisterAccessToken.bind(undefined,factory.cert),
      parameters: {},
      dependencies: [
        AdrConnectivityConfig,
        DataRecipientJwks,
        RegisterOidc,
        AssertDataRecipientIsActive
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,],
      cache: {
        minAge: 30,
        maxAge: 300
      },
    })

    const DataHolderBrands = new Dependency<{}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, RegisterAccessCredentials: Types.AccessToken}, Types.DataHolderRegisterMetadata[]>({
      name: "DataHolderBrands",
      evaluator: util.GetDataholders.bind(undefined,factory.cert),
      parameters: {},
      dependencies: [
        AdrConnectivityConfig,
        RegisterAccessCredentials
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,],
      cache: {
        maxAge: 14400
      },
    })

    const DataHolderBrandMetadata = new Dependency<{DataHolderBrandId: string}, {DataHolderBrands: Types.DataHolderRegisterMetadata[]}, Types.DataHolderRegisterMetadata>({
      name: "DataHolderBrandMetadata",
      evaluator: util.GetDataholderMetadata,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrands
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,],
      cache: {
        noCache: true
      },
    })

    const AssertDataHolderActiveAtRegister = new Dependency<{DataHolderBrandId: string}, {DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, void>({
      name: "AssertDataHolderActiveAtRegister",
      evaluator: util.AssertDataHolderActiveAtRegister,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,],
      cache: {
        noCache: true
      },
    })

    const DataHolderStatus = new Dependency<{DataHolderBrandId: string}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, Types.DataHolderStatus>({
      name: "DataHolderStatus",
      evaluator: util.DataHolderStatus.bind(undefined,factory.cert),
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        AdrConnectivityConfig,
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,],
      cache: {
        maxAge: 300
      },
    })

    const AssertDataHolderIsUp = new Dependency<{DataHolderBrandId: string}, {DataHolderBrandMetadata: Types.DataHolderRegisterMetadata, DataHolderStatus: Types.DataHolderStatus}, void>({
      name: "AssertDataHolderIsUp",
      evaluator: util.AssertDataHolderIsUp,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrandMetadata,
        DataHolderStatus
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,],
      cache: {
        noCache: true
      },
    })

    const DataHolderUpAndReady = new Dependency<{DataHolderBrandId: string}, {DataHolderBrandMetadata: Types.DataHolderRegisterMetadata, AssertDataHolderActiveAtRegister: void, AssertDataHolderIsUp: void}, void>({
      name: "DataHolderUpAndReady",
      evaluator: async () => {return},
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrandMetadata,
        AssertDataHolderActiveAtRegister,
        AssertDataHolderIsUp
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,],
      cache: {
        maxAge: 300
      },
    })

    const DataHolderOidc = new Dependency<{DataHolderBrandId: string}, {DataHolderBrandMetadata: Types.DataHolderRegisterMetadata, DataHolderUpAndReady: void}, Types.DataholderOidcResponse>({
      name: "DataHolderOidc",
      evaluator: util.GetDataHolderOidc.bind(undefined,factory.cert),
      validator: util.Validation.DataHolderOidcResponse,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrandMetadata,
        DataHolderUpAndReady
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,],
      cache: {
        minAge: 300
      },
    })

    const DataHolderJwks = new Dependency<{DataHolderBrandId: string}, {DataHolderOidc: Types.DataholderOidcResponse}, Types.JWKS.KeyStore>({
      name: "DataHolderJwks",
      evaluator: util.GetDataHolderJwks.bind(undefined,factory.cert),
      validator: util.Validation.DataHolderJwks,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderOidc
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,],
      cache: {
        minAge: 300
      },
      serializer: Serial.JWKS,
    })

    const DataHolderRevocationJwks = new Dependency<{DataHolderBrandId: string}, {DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, Types.JWKS.KeyStore>({
      name: "DataHolderRevocationJwks",
      evaluator: util.GetDataHolderRevocationJwks.bind(undefined,factory.cert),
      validator: util.Validation.DataHolderRevocationJwks,
      parameters: {
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,],
      cache: {
        minAge: 300
      },
      serializer: Serial.JWKS,
    })

    const SoftwareStatementAssertion = new Dependency<{SoftwareProductKey: string}, {SoftwareProductConfig: Types.SoftwareProductConnectivityConfig, AdrConnectivityConfig: Types.AdrConnectivityConfig, RegisterAccessCredentials: Types.AccessToken}, string>({
      name: "SoftwareStatementAssertion",
      evaluator: util.RegisterGetSSA.bind(undefined,factory.cert),
      validator: util.Validation.ValidAndCurrentSSA,
      parameters: {
        SoftwareProductKey:Identifiers.string
      },
      dependencies: [
        SoftwareProductConfig,
        AdrConnectivityConfig,
        RegisterAccessCredentials
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,],
      cache: {
        minAge: 300,
        maxAge: 1800
      },
    })

    const CurrentClientRegistration = new Dependency<{SoftwareProductKey: string, DataHolderBrandId: string}, {SoftwareProductConfig: Types.SoftwareProductConnectivityConfig, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, Types.DataHolderRegistration>({
      name: "CurrentClientRegistration",
      evaluator: util.GetCurrentClientRegistration.bind(undefined,factory.dataholderRegistrationManager),
      parameters: {
        SoftwareProductKey:Identifiers.string,
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        SoftwareProductConfig,
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,],
      cache: {
        noCache: true
      },
    })

    const DhNewClientRegistration = new Dependency<{SoftwareProductKey: string, DataHolderBrandId: string}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, SoftwareProductConfig: Types.SoftwareProductConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata, DataHolderUpAndReady: void, SoftwareStatementAssertion: string}, Types.DataHolderRegistration>({
      name: "DhNewClientRegistration",
      evaluator: util.NewClientRegistration.bind(undefined,factory.cert,factory.dataholderRegistrationManager),
      parameters: {
        SoftwareProductKey:Identifiers.string,
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        AdrConnectivityConfig,
        SoftwareProductConfig,
        DataRecipientJwks,
        DataHolderOidc,
        DataHolderBrandMetadata,
        DataHolderUpAndReady,
        SoftwareStatementAssertion
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,],
      cache: {
        noCache: true
      },
    })

    const BootstrapClientRegistration = new Dependency<{SoftwareProductKey: string, DataHolderBrandId: string}, {AssertSoftwareProductStatusIsActive: void, CurrentClientRegistration: Types.DataHolderRegistration, DhNewClientRegistration?: Types.DataHolderRegistration}, Types.DataHolderRegistration>({
      name: "BootstrapClientRegistration",
      evaluator: $ => $.CurrentClientRegistration || $.DhNewClientRegistration || (() => {throw new Error('Could not bootstrap client registration')})(),
      parameters: {
        SoftwareProductKey:Identifiers.string,
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        AssertSoftwareProductStatusIsActive,
        CurrentClientRegistration,
        {do: DhNewClientRegistration, when: ctx => !ctx.intermediate.CurrentClientRegistration}
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,],
      cache: {
        noCache: true
      },
    })

    const DhRegAccessToken = new Dependency<{SoftwareProductKey: string, DataHolderBrandId: string}, {DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, BootstrapClientRegistration: Types.DataHolderRegistration}, Types.AccessToken>({
      name: "DhRegAccessToken",
      evaluator: util.GetDataHolderRegistrationAccessToken.bind(undefined,factory.cert),
      parameters: {
        SoftwareProductKey:Identifiers.string,
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        DataRecipientJwks,
        DataHolderOidc,
        BootstrapClientRegistration
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,],
      cache: {
        minAge: 60,
        maxAge: 300
      },
    })

    const CheckAndUpdateClientRegistration = new Dependency<{SoftwareProductKey: string, DataHolderBrandId: string}, {AssertSoftwareProductStatusIsActive: void, AdrConnectivityConfig: Types.AdrConnectivityConfig, SoftwareProductConfig: Types.SoftwareProductConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, DataHolderUpAndReady: void, SoftwareStatementAssertion: string, BootstrapClientRegistration: Types.DataHolderRegistration, DhRegAccessToken: Types.AccessToken}, Types.DataHolderRegistration>({
      name: "CheckAndUpdateClientRegistration",
      evaluator: util.CheckAndUpdateClientRegistration.bind(undefined,factory.cert,factory.dataholderRegistrationManager),
      parameters: {
        SoftwareProductKey:Identifiers.string,
        DataHolderBrandId:Identifiers.string
      },
      dependencies: [
        AssertSoftwareProductStatusIsActive,
        AdrConnectivityConfig,
        SoftwareProductConfig,
        DataRecipientJwks,
        DataHolderOidc,
        DataHolderUpAndReady,
        SoftwareStatementAssertion,
        BootstrapClientRegistration,
        DhRegAccessToken
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,],
      cache: {
        minAge: 600,
        maxAge: 3600
      },
    })

    const GetAuthorizationRequest = new Dependency<{ConsentRequestParams: Types.ConsentRequestParams}, {DataHolderOidc: Types.DataholderOidcResponse, DataHolderUpAndReady: void, CheckAndUpdateClientRegistration: Types.DataHolderRegistration, AdrConnectivityConfig: Types.AdrConnectivityConfig, SoftwareProductConfig: Types.SoftwareProductConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, {redirectUrl: string, consentId: number, softwareProductId: string}>({
      name: "GetAuthorizationRequest",
      evaluator: util.GetAuthorizationRequest.bind(undefined,factory.cert,factory.consentManager),
      preassertions: [
        AssertSoftwareProductStatusIsActive,
        {do: DataHolderOidc, disableCache: true},
        {do: DataHolderUpAndReady, disableCache: true}
      ],
      parameters: {
        ConsentRequestParams:Identifiers.Types.ConsentRequestParams
      },
      project: {
        SoftwareProductKey:$ => $.ConsentRequestParams.productKey,
        DataHolderBrandId:$ => $.ConsentRequestParams.dataholderBrandId,
      },
      dependencies: [
        DataHolderOidc,
        DataHolderUpAndReady,
        CheckAndUpdateClientRegistration,
        AdrConnectivityConfig,
        SoftwareProductConfig,
        DataRecipientJwks,
        DataHolderBrandMetadata
      ],
      // disabledCaches: ["DataHolderOidc","DataHolderUpAndReady"]
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,],
      cache: {
        noCache: true
      },
    })

    const SyncRefreshTokenStatus = new Dependency<{Consent: Types.ConsentRequestLog}, {DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, CheckAndUpdateClientRegistration: Types.DataHolderRegistration}, Types.RefreshTokenStatus>({
      name: "SyncRefreshTokenStatus",
      evaluator: util.SyncRefreshTokenStatus.bind(undefined,factory.consentManager,factory.logger,factory.cert),
      preassertions: [
        AssertSoftwareProductStatusIsActive
      ],
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataRecipientJwks,
        DataHolderOidc,
        CheckAndUpdateClientRegistration
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,],
      cache: {
        maxAge: 3600
      },
    })

    const FetchTokens = new Dependency<{Consent: Types.ConsentRequestLog}, {DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, CheckAndUpdateClientRegistration: Types.DataHolderRegistration, SyncRefreshTokenStatus: Types.RefreshTokenStatus}, {tokenResponse:Types.TokenResponse, tokenRequestTime:Date}>({
      name: "FetchTokens",
      evaluator: util.FetchTokens.bind(undefined,factory.logger,factory.cert),
      preassertions: [
        AssertSoftwareProductStatusIsActive
      ],
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataRecipientJwks,
        DataHolderOidc,
        CheckAndUpdateClientRegistration,
        SyncRefreshTokenStatus
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const FetchTokensAndUpdateClaims = new Dependency<{Consent: Types.ConsentRequestLog}, {DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, DataHolderJwks: Types.JWKS.KeyStore, CheckAndUpdateClientRegistration: Types.DataHolderRegistration, FetchTokens: {tokenResponse:Types.TokenResponse, tokenRequestTime:Date}}, Types.ConsentRequestLog>({
      name: "FetchTokensAndUpdateClaims",
      evaluator: util.UpdateClaims.bind(undefined,factory.cert,factory.consentManager),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataRecipientJwks,
        DataHolderOidc,
        DataHolderJwks,
        CheckAndUpdateClientRegistration,
        FetchTokens
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,DataHolderJwks,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const ConsentRefreshTokens = new Dependency<{Consent: Types.ConsentRequestLog}, {FetchTokensAndUpdateClaims: Types.ConsentRequestLog}, Types.ConsentRequestLog>({
      name: "ConsentRefreshTokens",
      evaluator: $ => $.FetchTokensAndUpdateClaims,
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        FetchTokensAndUpdateClaims
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,DataHolderJwks,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const ConsentCurrentAccessToken = new Dependency<{Consent: Types.ConsentRequestLog}, {AssertSoftwareProductStatusIsActive: void, DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, CheckAndUpdateClientRegistration: Types.DataHolderRegistration, ConsentRefreshTokens?: Types.ConsentRequestLog}, Types.ConsentRequestLog>({
      name: "ConsentCurrentAccessToken",
      evaluator: $ => ($.ConsentRefreshTokens || $.Consent),
      validator: output => output.HasCurrentAccessToken(),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        AssertSoftwareProductStatusIsActive,
        DataRecipientJwks,
        DataHolderOidc,
        CheckAndUpdateClientRegistration,
        {do: ConsentRefreshTokens, when: ctx => ctx.parameters.Consent.HasCurrentRefreshToken() && !ctx.parameters.Consent.HasCurrentAccessToken()}
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const ConsumerDataAccessCredentials = new Dependency<{Consent: Types.ConsentRequestLog, ResourcePath: string}, {DataHolderUpAndReady: void, DataHolderOidc: Types.DataholderOidcResponse, ConsentCurrentAccessToken: Types.ConsentRequestLog, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, {Consent: Types.ConsentRequestLog, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}>({
      name: "ConsumerDataAccessCredentials",
      evaluator: $ => ({Consent: $.ConsentCurrentAccessToken, DataHolderBrandMetadata: $.DataHolderBrandMetadata}),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog,
        ResourcePath:Identifiers.string
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataHolderUpAndReady,
        DataHolderOidc,
        ConsentCurrentAccessToken,
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const UserInfoAccessCredentials = new Dependency<{Consent: Types.ConsentRequestLog}, {DataHolderUpAndReady: void, DataHolderOidc: Types.DataholderOidcResponse, ConsentCurrentAccessToken: Types.ConsentRequestLog, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}, {Consent: Types.ConsentRequestLog, DataHolderOidc: Types.DataholderOidcResponse}>({
      name: "UserInfoAccessCredentials",
      evaluator: $ => ({Consent: $.ConsentCurrentAccessToken, DataHolderOidc: $.DataHolderOidc}),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataHolderUpAndReady,
        DataHolderOidc,
        ConsentCurrentAccessToken,
        DataHolderBrandMetadata
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const ConsentUserInfo = new Dependency<{Consent: Types.ConsentRequestLog}, {DataHolderOidc: Types.DataholderOidcResponse, ConsentCurrentAccessToken: Types.ConsentRequestLog}, Types.UserInfoResponse>({
      name: "ConsentUserInfo",
      evaluator: $ => util.GetUserInfo(factory.cert,$),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        DataHolderOidc,
        ConsentCurrentAccessToken
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const AssertValidAuthorizeResponse = new Dependency<{Consent: Types.ConsentRequestLog, AuthCode: string, IdToken: string, State: string}, {CheckAndUpdateClientRegistration: Types.DataHolderRegistration, DataHolderOidc: Types.DataholderOidcResponse, DataHolderJwks: Types.JWKS.KeyStore, DataRecipientJwks: Types.JWKS.KeyStore}, void>({
      name: "AssertValidAuthorizeResponse",
      evaluator: util.ValidateAuthorizeResponse,
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog,
        AuthCode:Identifiers.string,
        IdToken:Identifiers.string,
        State:Identifiers.string
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        CheckAndUpdateClientRegistration,
        DataHolderOidc,
        DataHolderJwks,
        DataRecipientJwks
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,],
      cache: {
        noCache: true
      },
    })

    const FinaliseConsent = new Dependency<{Consent: Types.ConsentRequestLog, AuthCode: string, IdToken: string, State: string}, {AssertValidAuthorizeResponse: void, FetchTokensAndUpdateClaims: Types.ConsentRequestLog}, Types.ConsentRequestLog>({
      name: "FinaliseConsent",
      evaluator: $ => $.FetchTokensAndUpdateClaims,
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog,
        AuthCode:Identifiers.string,
        IdToken:Identifiers.string,
        State:Identifiers.string
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        AssertValidAuthorizeResponse,
        FetchTokensAndUpdateClaims
      ],
      // disabledCaches: []
      cacheTrail: [SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,DataHolderJwks,SyncRefreshTokenStatus,],
      cache: {
        noCache: true
      },
    })

    const PropagateRevokeConsent = new Dependency<{Consent: Types.ConsentRequestLog}, {AdrConnectivityConfig: Types.AdrConnectivityConfig, DataRecipientJwks: Types.JWKS.KeyStore, DataHolderOidc: Types.DataholderOidcResponse, CheckAndUpdateClientRegistration: Types.DataHolderRegistration}, Types.ConsentRequestLog>({
      name: "PropagateRevokeConsent",
      evaluator: util.PropagateRevokedConsent.bind(undefined,factory.logger,factory.cert,factory.consentManager),
      parameters: {
        Consent:Identifiers.Types.ConsentRequestLog
      },
      project: {
        SoftwareProductId:$ => $.Consent.softwareProductId,
        DataHolderBrandId:$ => $.Consent.dataHolderId,
      },
      dependencies: [
        AdrConnectivityConfig,
        DataRecipientJwks,
        DataHolderOidc,
        CheckAndUpdateClientRegistration
      ],
      // disabledCaches: []
      cacheTrail: [DataRecipientJwks,RegisterOidc,DataRecipientStatus,RegisterAccessCredentials,DataHolderBrands,DataHolderStatus,DataHolderUpAndReady,DataHolderOidc,SoftwareProductConfigs,SoftwareProductConfig,SoftwareProductStatus,SoftwareStatementAssertion,DhRegAccessToken,CheckAndUpdateClientRegistration,],
      cache: {
        noCache: true
      },
    })

    
    return { AdrConnectivityConfig, SoftwareProductConfigs, SoftwareProductConfig, DataRecipientJwks, RegisterOidc, DataRecipientStatus, AssertDataRecipientIsActive, SoftwareProductStatus, AssertSoftwareProductStatusIsActive, RegisterAccessCredentials, DataHolderBrands, DataHolderBrandMetadata, AssertDataHolderActiveAtRegister, DataHolderStatus, AssertDataHolderIsUp, DataHolderUpAndReady, DataHolderOidc, DataHolderJwks, DataHolderRevocationJwks, SoftwareStatementAssertion, CurrentClientRegistration, DhNewClientRegistration, BootstrapClientRegistration, DhRegAccessToken, CheckAndUpdateClientRegistration, GetAuthorizationRequest, SyncRefreshTokenStatus, FetchTokens, FetchTokensAndUpdateClaims, ConsentRefreshTokens, ConsentCurrentAccessToken, ConsumerDataAccessCredentials, UserInfoAccessCredentials, ConsentUserInfo, AssertValidAuthorizeResponse, FinaliseConsent, PropagateRevokeConsent,  }
    
  
  }

  public Dependencies = this.MakeDependencies()

}