import * as Types from "./Types"
import { DependencyGraph } from "./DependencyGraph.generated";
import { AbstractCache } from "./Cache/AbstractCache";
import { CommsDependencyEvaluator } from "./CommsDependencyEvaluator";
import { inject, injectable } from "tsyringe";
import { ClientCertificateInjector } from "../Services/ClientCertificateInjection";
import { DataHolderRegistrationManager } from "../Entities/DataHolderRegistration";
import { ConsentRequestLogManager } from "../Entities/ConsentRequestLog";
import winston from "winston";
import _ from "lodash"

@injectable()
export class DefaultConnector {
  graph: DependencyGraph

  constructor(
    @inject("AdrConnectivityConfig") public configFn:() => Promise<Types.AdrConnectivityConfig>,
    @inject("ClientCertificateInjector") public cert:ClientCertificateInjector,
    @inject("Logger") public logger:winston.Logger,
    public dataholderRegistrationManager: DataHolderRegistrationManager,
    public consentManager:ConsentRequestLogManager,
    @inject("Cache") private cache: AbstractCache
  ) {
    this.graph = new DependencyGraph(configFn,cert,logger,dataholderRegistrationManager,consentManager)
  }


  public AdrConnectivityConfig = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AdrConnectivityConfig,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.AdrConnectivityConfig>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AdrConnectivityConfig,{  }, $)
  })
  public SoftwareProductConfigs = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductConfigs,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.IndexedSoftwareProductConfigs>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductConfigs,{  }, $)
  })
  public SoftwareProductConfig = (SoftwareProductId: Types.StringOrUndefined) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductConfig,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.SoftwareProductConnectivityConfig>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductConfig,{ SoftwareProductId }, $)
  })
  public DataRecipientJwks = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataRecipientJwks,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.JWKS.KeyStore>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataRecipientJwks,{  }, $)
  })
  public RegisterOidc = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterOidc,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.RegisterOidcResponse>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterOidc,{  }, $)
  })
  public DataRecipientStatus = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataRecipientStatus,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<string>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataRecipientStatus,{  }, $)
  })
  public AssertDataRecipientIsActive = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataRecipientIsActive,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataRecipientIsActive,{  }, $)
  })
  public SoftwareProductStatus = (SoftwareProductId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductStatus,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<string>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareProductStatus,{ SoftwareProductId }, $)
  })
  public AssertSoftwareProductStatusIsActive = (SoftwareProductId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertSoftwareProductStatusIsActive,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertSoftwareProductStatusIsActive,{ SoftwareProductId }, $)
  })
  public RegisterAccessCredentials = (SoftwareProductId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterAccessCredentials,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.AccessToken>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterAccessCredentials,{ SoftwareProductId }, $)
  })
  public RegisterAccessCredentialsDHB = (SoftwareProductId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterAccessCredentialsDHB,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.AccessToken>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.RegisterAccessCredentialsDHB,{ SoftwareProductId }, $)
  })
  public DataHolderBrands = () => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderBrands,{  }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegisterMetadata[]>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderBrands,{  }, $)
  })
  public DataHolderBrandMetadata = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderBrandMetadata,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegisterMetadata>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderBrandMetadata,{ DataHolderBrandId }, $)
  })
  public AssertDataHolderActiveAtRegister = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataHolderActiveAtRegister,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataHolderActiveAtRegister,{ DataHolderBrandId }, $)
  })
  public DataHolderStatus = (DataHolderBrandId: string, IgnoreDHStatus: boolean) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderStatus,{ DataHolderBrandId, IgnoreDHStatus }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderStatus>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderStatus,{ DataHolderBrandId, IgnoreDHStatus }, $)
  })
  public AssertDataHolderIsUp = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataHolderIsUp,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertDataHolderIsUp,{ DataHolderBrandId }, $)
  })
  public DataHolderUpAndReady = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderUpAndReady,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderUpAndReady,{ DataHolderBrandId }, $)
  })
  public DataHolderOidc = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderOidc,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataholderOidcResponse>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderOidc,{ DataHolderBrandId }, $)
  })
  public DataHolderJwks = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderJwks,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.JWKS.KeyStore>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderJwks,{ DataHolderBrandId }, $)
  })
  public DataHolderRevocationJwks = (DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderRevocationJwks,{ DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.JWKS.KeyStore>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DataHolderRevocationJwks,{ DataHolderBrandId }, $)
  })
  public SoftwareStatementAssertion = (SoftwareProductId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareStatementAssertion,{ SoftwareProductId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<string>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SoftwareStatementAssertion,{ SoftwareProductId }, $)
  })
  public CurrentClientRegistration = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.CurrentClientRegistration,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegistration>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.CurrentClientRegistration,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public DhNewClientRegistration = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhNewClientRegistration,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegistration>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhNewClientRegistration,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public BootstrapClientRegistration = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.BootstrapClientRegistration,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegistration>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.BootstrapClientRegistration,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public DhRegAccessToken = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhRegAccessToken,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.AccessToken>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhRegAccessToken,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public DhDeleteClientRegistration = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhDeleteClientRegistration,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegistration>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.DhDeleteClientRegistration,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public CheckAndUpdateClientRegistration = (SoftwareProductId: string, DataHolderBrandId: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.CheckAndUpdateClientRegistration,{ SoftwareProductId, DataHolderBrandId }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.DataHolderRegistration>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.CheckAndUpdateClientRegistration,{ SoftwareProductId, DataHolderBrandId }, $)
  })
  public GetAuthorizationRequest = (ConsentRequestParams: Types.ConsentRequestParams, IgnoreDHStatus: boolean) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.GetAuthorizationRequest,{ ConsentRequestParams, IgnoreDHStatus }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<{redirectUrl: string, consentId: number, softwareProductId: string}>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.GetAuthorizationRequest,{ ConsentRequestParams, IgnoreDHStatus }, $)
  })
  public SyncRefreshTokenStatus = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SyncRefreshTokenStatus,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.RefreshTokenStatus>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.SyncRefreshTokenStatus,{ Consent }, $)
  })
  public FetchTokens = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FetchTokens,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<{tokenResponse:Types.TokenResponse, tokenRequestTime:Date}>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FetchTokens,{ Consent }, $)
  })
  public FetchTokensAndUpdateClaims = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FetchTokensAndUpdateClaims,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.ConsentRequestLog>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FetchTokensAndUpdateClaims,{ Consent }, $)
  })
  public ConsentRefreshTokens = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentRefreshTokens,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.ConsentRequestLog>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentRefreshTokens,{ Consent }, $)
  })
  public ConsentCurrentAccessToken = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentCurrentAccessToken,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.ConsentRequestLog>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentCurrentAccessToken,{ Consent }, $)
  })
  public ConsumerDataAccessCredentials = (Consent: Types.ConsentRequestLog, ResourcePath: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsumerDataAccessCredentials,{ Consent, ResourcePath }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<{Consent: Types.ConsentRequestLog, DataHolderBrandMetadata: Types.DataHolderRegisterMetadata}>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsumerDataAccessCredentials,{ Consent, ResourcePath }, $)
  })
  public UserInfoAccessCredentials = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.UserInfoAccessCredentials,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<{Consent: Types.ConsentRequestLog, DataHolderOidc: Types.DataholderOidcResponse}>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.UserInfoAccessCredentials,{ Consent }, $)
  })
  public ConsentUserInfo = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentUserInfo,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.UserInfoResponse>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.ConsentUserInfo,{ Consent }, $)
  })
  public AssertValidAuthorizeResponse = (Consent: Types.ConsentRequestLog, AuthCode: string, IdToken: string, State: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertValidAuthorizeResponse,{ Consent, AuthCode, IdToken, State }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<void>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.AssertValidAuthorizeResponse,{ Consent, AuthCode, IdToken, State }, $)
  })
  public FinaliseConsent = (Consent: Types.ConsentRequestLog, AuthCode: string, IdToken: string, State: string) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FinaliseConsent,{ Consent, AuthCode, IdToken, State }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.ConsentRequestLog>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.FinaliseConsent,{ Consent, AuthCode, IdToken, State }, $)
  })
  public PropagateRevokeConsent = (Consent: Types.ConsentRequestLog) => ({
    Evaluate: ($?: Types.EvalOpts) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.PropagateRevokeConsent,{ Consent }, _.merge({maxHealingIterations: 0},$)),
    GetWithHealing: ($?: Types.GetOpts<Types.ConsentRequestLog>) => new CommsDependencyEvaluator(this.cache, this.graph.logger).get(this.graph.Dependencies.PropagateRevokeConsent,{ Consent }, $)
  })

}