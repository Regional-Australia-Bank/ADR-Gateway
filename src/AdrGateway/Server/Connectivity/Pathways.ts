import { inject, singleton, injectable } from "tsyringe"
import { AdrConnectivityConfig } from "../../Config"
import { RegisterOidcNeuron } from "./Neurons/RegisterOidc"
import { RegisterGetDataholdersNeuron, GetDataHolderBrandMetadataNeuron, RegisterGetSSANeuron, DataholderRegisterMetadata } from "./Neurons/RegisterDataholders"
import { DataRecipientJwks } from "./Neurons/DataRecipientJwks"
import { Neuron, CompoundNeuron } from "../../../Common/Connectivity/Neuron"
import { GetSoftwareProductStatusNeuron } from "./Neurons/SoftwareProductStatus"
import { RegisterTokenNeuron } from "./Neurons/RegisterToken"
import { GetDataHolderOidcNeuron, DataHolderRegistrationAccessTokenNeuron, NewClientRegistrationNeuron, BootstrapClientRegistrationNeuron, GetDataHolderJwksNeuron, DataholderOidcResponse, CheckAndUpdateClientRegistrationNeuron, GetDataHolderJwksFromRegisterNeuron } from "./Neurons/DataholderRegistration"
import { DataHolderRegistrationManager, DataHolderRegistration } from "../../Entities/DataHolderRegistration"
import { ConsentRequestParams, AuthorizationRequestNeuron } from "./Neurons/AuthorizationRequest"
import { ConsentRequestLogManager, ConsentRequestLog } from "../../Entities/ConsentRequestLog"
import { NeuronFactory } from "./NeuronFactory"
import { DataHolderStatusNeurons } from "./Neurons/RegisterDataholderStatus"
import _ from "lodash"
import { ClientCertificateInjector } from "../../Services/ClientCertificateInjection"
import { IdTokenCodeValidationNeuron } from "./Neurons/IdTokenCodeValidation"
import { UserInfoNeuron, AccessTokenHolder } from "./Neurons/UserInfo"
import { ConsentRefreshTokenNeuron } from "./Neurons/ConsentRefreshToken"
import { ConsentRevocationPropagationNeuron } from "./Neurons/ConsentRevocationPropagation"
import { ConsumerDataAccessCredentialsNeuron } from "./Neurons/ConsumerDataAccessCredentials"
import { ConsentNewAccessTokenNeuron, ValidateConsentNeuron } from "./Neurons/ConsentAccessToken"
import winston from "winston"
import { SoftwareProductConfig, SoftwareProductConfigs } from "./Neurons/SoftwareProductConfig"
import { PathwayGeneratorSymbol, NameCompoundNeurons } from "../../../Common/Connectivity/PathwayFactory"

let DataHolderStatus:ReturnType<typeof DataHolderStatusNeurons>

let instanceCount = 0;

@injectable()
export class DefaultPathways {

    constructor(
        @inject("AdrConnectivityConfig") public configFn:() => Promise<AdrConnectivityConfig>,
        @inject("ClientCertificateInjector") public cert:ClientCertificateInjector,
        @inject("Logger") public logger:winston.Logger,
        public dataholderRegistrationManager: DataHolderRegistrationManager,
        public consentManager:ConsentRequestLogManager,
        private nf:NeuronFactory
    ) {
        // instanceCount++;
        // if (instanceCount > 1) throw 'DefaultPathways is being constructed a second time'
        DataHolderStatus = DataHolderStatusNeurons(nf)

        NameCompoundNeurons(this);
        NameCompoundNeurons(DataHolderStatus);

    }

    // TODO Allow to config client certificates optionally (warning when not supplied)
    // TODO Config validation on startup
    AdrConnectivityConfig = this.nf.GenerateOnce(
        () => Neuron.NeuronZero().Extend(this.nf.Simple(async () => await this.configFn()))) 


    SoftwareProductConfigs = this.nf.GenerateOnce(
        () => this.AdrConnectivityConfig().Extend(this.nf.Make(SoftwareProductConfigs))
    )

    SoftwareProductConfig = this.nf.GenerateOnce(
        (softwareProductId:string) => this.AdrConnectivityConfig().Extend(this.nf.Make(SoftwareProductConfig,softwareProductId))
    )

    DataRecipientJwks = this.nf.GenerateOnce(
        () => this.AdrConnectivityConfig().Extend(this.nf.Make(DataRecipientJwks)))    

    RegisterOidc = this.nf.GenerateOnce(
        () => this.AdrConnectivityConfig().Extend(this.nf.Make(RegisterOidcNeuron,this.cert)))

    // TODO cache
    SoftwareProductStatusIsActive = this.nf.GenerateOnce(
        () => 
            this.AdrConnectivityConfig()
            // TODO implement
            .Extend(this.nf.Make(GetSoftwareProductStatusNeuron))             
    )

    // TODO cache
    RegisterAccessCredentials = this.nf.GenerateOnce(
        () => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.DataRecipientJwks(),
            this.RegisterOidc(),
            this.SoftwareProductStatusIsActive())
            .Extend(this.nf.Make(RegisterTokenNeuron,this.cert)))

    // TODO cache
    DataHolderBrands = this.nf.GenerateOnce(
        () => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.RegisterAccessCredentials())            
            .Extend(this.nf.Make(RegisterGetDataholdersNeuron,this.cert)))

    // TODO cache
    DataHolderBrandMetadata = this.nf.GenerateOnce(
        (dataholderBrandId: string) => Neuron.Require(this.DataHolderBrands())            
            .Extend(this.nf.Make(GetDataHolderBrandMetadataNeuron,dataholderBrandId))) // MAY not use make on a Neuron with a non-simple constructor


    // TODO cache
    DataHolderOidc = this.nf.GenerateOnce(
        (dataHolderBrandId:string) => 
            this.DataHolderUpAndReady(dataHolderBrandId)
            .Extend(this.nf.Make(GetDataHolderOidcNeuron,dataHolderBrandId,this.cert))
    )

    DataHolderJwks = this.nf.GenerateOnce(
        (dataHolderBrandId:string) => 
            this.DataHolderOidc(dataHolderBrandId)
            .Extend(this.nf.Make(GetDataHolderJwksNeuron,dataHolderBrandId,this.cert))
    )

    DataHolderJwks_ForRevokeNotifyToAdr = this.nf.GenerateOnce(
        (dataHolderBrandId:string) => 
            this.DataHolderBrandMetadata(dataHolderBrandId)
            .Extend(this.nf.Make(GetDataHolderJwksFromRegisterNeuron,dataHolderBrandId))
    )

    // TODO cache?
    SoftwareStatementAssertion = this.nf.GenerateOnce(
        (softwareProductId:string) => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.SoftwareProductConfig(softwareProductId),
            this.RegisterAccessCredentials())            
            .Extend(this.nf.Make(RegisterGetSSANeuron,this.cert)))

    // TODO cache
    // TODO reinstate assertions
    DataHolderUpAndReady = this.nf.GenerateOnce(
        (dataHolderBrandId:string) => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.DataHolderBrandMetadata(dataHolderBrandId)//.Assert(DataHolderStatus.ActiveAtRegister)
            
        )/*.Assert(DataHolderStatus.UpAndRunning)*/.Extend(this.nf.Simple(([a,b]:[AdrConnectivityConfig,DataholderRegisterMetadata]) => b))
    )

    BootstrapClientRegistration = this.nf.GenerateOnce(
        (softwareProductId:string,dataHolderBrandId:string) => Neuron.Require(
            this.SoftwareProductConfig(softwareProductId),
            this.DataHolderUpAndReady(dataHolderBrandId)
        )
        .Extend(this.nf.Make(BootstrapClientRegistrationNeuron,this.dataholderRegistrationManager))
        .Do(this.DhNewClientRegistration(softwareProductId,dataHolderBrandId)).When(reg => _.isUndefined(reg)).Else(this.nf.Passthru<DataHolderRegistration|undefined>())
        .AssertNotUndefined()
    )

    DhNewClientRegistration = this.nf.GenerateOnce(
        (softwareProductId:string,dataHolderBrandId:string) => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.SoftwareProductConfig(softwareProductId),
            this.DataRecipientJwks(),
            this.DataHolderOidc(dataHolderBrandId),
            this.DataHolderUpAndReady(dataHolderBrandId),
            this.SoftwareStatementAssertion(softwareProductId)
        ).Extend(this.nf.Make(NewClientRegistrationNeuron,this.dataholderRegistrationManager,this.cert))
    )

    /**
     * This is the main pathway responsible for ensuring an that a cient registration exists at a dataholder and is up to date
     */ 
    CheckAndUpdateClientRegistration = this.nf.GenerateOnce(
        (softwareProductId:string,dataHolderBrandId:string) => Neuron.Require(
            this.AdrConnectivityConfig(),
            this.SoftwareProductConfig(softwareProductId),
            this.DataRecipientJwks(),
            this.DataHolderUpAndReady(dataHolderBrandId),
            this.DataHolderOidc(dataHolderBrandId),
            this.SoftwareStatementAssertion(softwareProductId),
            this.BootstrapClientRegistration(softwareProductId,dataHolderBrandId),
            this.DhRegAccessToken(softwareProductId,dataHolderBrandId)
        ).Extend(this.nf.Make(CheckAndUpdateClientRegistrationNeuron,dataHolderBrandId,this.dataholderRegistrationManager,this.cert)) // TODO result is to be cached with an expiry. Alternatively, with right-to-left evaluation, leave uncached for 
    );

    // CheckAndUpdateClientRegistration_WORKAROUND = this.BootstrapClientRegistration // TODO remove this switch. Perhaps configure as environment veriable
    CheckAndUpdateClientRegistration_WORKAROUND = this.CheckAndUpdateClientRegistration

    // TODO cache?
    /**
     * The Dataholder DCR access token is needed to get/update the current registration
     */
    DhRegAccessToken = this.nf.GenerateOnce(
        (softwareProductId:string,dataHolderBrandId:string) => Neuron.Require(
            this.DataRecipientJwks(),
            this.DataHolderOidc(dataHolderBrandId),
            this.BootstrapClientRegistration(softwareProductId,dataHolderBrandId)
        ).Extend(this.nf.Make(DataHolderRegistrationAccessTokenNeuron,this.cert))
    ,)

    DhClientAuthenticationCheck = this.DhRegAccessToken
 
    GetAuthorizationRequest = this.nf.Parameterize(
        (params:ConsentRequestParams) => Neuron.Presume(
            Neuron.Combined(
                this.AdrConnectivityConfig(),
                this.DataHolderBrandMetadata(params.dataholderBrandId).Assert(Neuron.Isolate(                    
                    GetDataHolderOidcNeuron(params.dataholderBrandId,this.cert), 'NoCache'
                ))
            ).Assert(Neuron.Isolate(
                DataHolderStatus.UpAtDataholder, 'NoCache'
            ))
        ).Extend(Neuron.Require(
                this.CheckAndUpdateClientRegistration_WORKAROUND(params.productKey,params.dataholderBrandId),
                this.DataHolderOidc(params.dataholderBrandId),
                this.AdrConnectivityConfig(),
                this.SoftwareProductConfig(params.productKey),
                this.DataRecipientJwks(),
                Neuron.Value(params)
            )
        ).Extend(this.nf.Make(AuthorizationRequestNeuron,this.consentManager))
        // TODO review the efficiency of the below approach
        // It is a requirement of the ecosystem that the data recipient must not contact the data holder if the cache is older
        // than 1 hour. This requirement is honourd by the cache expiry on the DataHolderBrandMetadata Neuron below
        .Assert(this.DataHolderBrandMetadata(params.dataholderBrandId))
    )

    ValidIdTokenCode = this.nf.Parameterize(
        (softwareProductId,dataholderBrandId:string,idToken:string) => 
            Neuron.Require(
                this.DataRecipientJwks(),
                this.DataHolderJwks(dataholderBrandId),
                this.DataHolderOidc(dataholderBrandId),
                this.CheckAndUpdateClientRegistration_WORKAROUND(softwareProductId,dataholderBrandId),
            ).Extend(this.nf.Make(IdTokenCodeValidationNeuron,idToken))
    )

    ConsentCurrentAccessToken = this.nf.Parameterize((consent:ConsentRequestLog) => 
        <CompoundNeuron<void,ConsentRequestLog>> Neuron.Require(
            this.DataRecipientJwks(),
            this.DataHolderOidc(consent.dataHolderId),
            this.CheckAndUpdateClientRegistration_WORKAROUND(consent.productKey,consent.dataHolderId),
            Neuron.Value(consent).Do(this.ConsentNewRefreshToken(consent)).When(c => c.HasCurrentRefreshToken() && !c.HasCurrentAccessToken()).Else(Neuron.Value(consent))
            .AssertNotUndefined()
        )
        .Extend(this.nf.Simple((([a,b,c,consent]:[any,any,any,ConsentRequestLog]) => consent)))
        .Extend(this.nf.Make(ValidateConsentNeuron))
    )

    ConsentNewRefreshToken = this.nf.Parameterize((consent:ConsentRequestLog) => 
        <CompoundNeuron<void,ConsentRequestLog>> Neuron.Require(
            this.DataRecipientJwks(),
            this.DataHolderOidc(consent.dataHolderId),
            this.CheckAndUpdateClientRegistration_WORKAROUND(consent.productKey,consent.dataHolderId),
        ).Extend(this.nf.Make(ConsentRefreshTokenNeuron,this.cert,consent,{grant_type:"refresh_token"},this,this.consentManager))
    )

    ConsumerDataAccessCredentials = this.nf.Parameterize((consent:ConsentRequestLog,resourcePath:string) => 
        Neuron.Require(
            this.DataHolderUpAndReady(consent.dataHolderId),
            this.DataHolderOidc(consent.dataHolderId),
            this.ConsentCurrentAccessToken(consent)
        )
        .Extend(this.nf.Make(ConsumerDataAccessCredentialsNeuron,this.cert,resourcePath))
        // It is a requirement of the ecosystem that the data recipient must not contact the data holder if the cache is older
        // than 1 hour. This requirement is honourd by the cache expiry on the DataHolderBrandMetadata Neuron below
        .Assert(this.DataHolderBrandMetadata(consent.dataHolderId))
    )

    UserInfoAccessCredentials = this.nf.Parameterize((consent:ConsentRequestLog) => 
        Neuron.Require(
            this.DataHolderUpAndReady(consent.dataHolderId),
            this.DataHolderOidc(consent.dataHolderId),
            this.ConsentCurrentAccessToken(consent)
        )
        .Extend(this.nf.Make(ConsumerDataAccessCredentialsNeuron,this.cert))
        // It is a requirement of the ecosystem that the data recipient must not contact the data holder if the cache is older
        // than 1 hour. This requirement is honourd by the cache expiry on the DataHolderBrandMetadata Neuron below
        .Assert(this.DataHolderBrandMetadata(consent.dataHolderId))
)

    ConsentUserInfo = this.nf.Parameterize((consent:ConsentRequestLog,newAccessToken?:AccessTokenHolder) => 
        Neuron.Require(
            this.DataHolderOidc(consent.dataHolderId),
            Neuron.Value(newAccessToken)
                .Do(this.ConsentCurrentAccessToken(consent))
                .When(at => !(at))
                .Else(Neuron.Value(newAccessToken)).AssertNotUndefined() //this.ConsentCurrentAccessToken(consent),
        ).Extend(this.nf.Make(UserInfoNeuron,this.cert))
    )

    FinaliseConsent = this.nf.Parameterize(
        (consent:ConsentRequestLog,code:string) => 
            Neuron.Require(
                this.DataRecipientJwks(),
                this.DataHolderOidc(consent.dataHolderId),
                this.CheckAndUpdateClientRegistration_WORKAROUND(consent.productKey,consent.dataHolderId),
            ).Extend(this.nf.Make(ConsentRefreshTokenNeuron,this.cert,consent,{grant_type:"authorization_code",code},this,this.consentManager)
        )       
    )

    PropagateRevokeConsent = this.nf.Parameterize(
        (consent:ConsentRequestLog) => 
            Neuron.Require(
                this.DataRecipientJwks(),
                this.DataHolderOidc(consent.dataHolderId),
                this.BootstrapClientRegistration(consent.productKey,consent.dataHolderId), // was CheckAndUpdateClientRegistration, but there should be no need to in the case of revocation
            ).Extend(this.nf.Make(ConsentRevocationPropagationNeuron,this.cert,consent,this,this.consentManager)
        )       
    )
}