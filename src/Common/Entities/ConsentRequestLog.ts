import {Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection, Not, IsNull, MoreThan} from "typeorm";
import {inject, injectable} from "tsyringe";
import "reflect-metadata";
import winston = require("winston");
import moment = require("moment");
import _ from "lodash"

enum LifeCycleStatus {
    PENDING = "PENDING",
    CURRENT = "CURRENT",
    EXPIRED = "EXPIRED",
    REVOKED = "REVOKED"
}

@Entity()
class ConsentRequestLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;
    @Column()
    adrSystemId!: string;
    @Column()
    adrSystemUserId!: string;
    @Column()
    dataHolderId!: string;
    @Column()
    productKey!: string; // a nickname for use by AdrGateway consumer
    @Column()
    softwareProductId!: string; // the id of the product at the register
    @Column()
    requestedScopesJson!: string;
    @Column({nullable: true})
    confirmedScopesJson?: string;
    @Column()
    state!: string;
    @Column()
    nonce!: string;
    @Column()
    requestedSharingDuration!: number;
    @Column()
    redirectUri!: string;
    @Column()
    requestDate!: Date;
    @Column({nullable: true})
    sharingEndDate?: Date;
    @Column({nullable: true})
    refreshTokenExpiry?: Date;
    @Column({nullable: true})
    accessTokenExpiry!: Date;
    @Column({nullable: true})
    consentedDate!: Date;

    @Column({nullable: true})
    revocationDate?: Date;

    @Column({nullable: true})
    revokedAt?: String;

    @Column({nullable: true})
    revocationPropagationDate?: Date;

    @Column({nullable: true, length:4000})
    idTokenJson!: string;
    @Column({nullable: true})
    ppid!: string;
    @Column({nullable: true, length:4000})
    accessToken!: string;

    @Column({nullable: true, length:255})
    arrangementId?: string;

    @Column({nullable: true, length:4000})
    refreshToken?: string;

    ValidateAsCurrent = () => {
        if (this.revocationDate) throw 'Token is revoked';
        if (!this.consentedDate) throw 'Consent has not been completed';
        if (this.SharingDurationExpired() && this.AccessTokenExpired()) throw 'Consent has expired';
        if (this.RefreshTokenExpired() && this.AccessTokenExpired()) throw 'Tokens have expired';
        if (!this.refreshToken && this.AccessTokenExpired()) throw 'Access token expired and no refresh token';
    }

    LifeCycleStatus = ():LifeCycleStatus => {
        let status = LifeCycleStatus.PENDING;
        if (this.consentedDate) status = LifeCycleStatus.CURRENT;
        if ((!this.IsCurrent()) && (this.IsFinalised())) status = LifeCycleStatus.EXPIRED;
        if (this.revocationDate) status = LifeCycleStatus.REVOKED;
        return status
    }

    IsCurrent = () => {
        try{
            this.ValidateAsCurrent()
        } catch {
            return false;
        }
        return true;
    }

    IsFinalised = () => {
        if (typeof this.idTokenJson != 'string') return false;
        if (this.idTokenJson.length < 1) return false;
        if (typeof this.accessToken != 'string') return false;
        if (this.accessToken.length < 1) return false;

        return true;
    }

    HasCurrentAccessToken = ():boolean => {
        try {this.ValidateAsCurrent()} catch {return false;}

        // return true if we have an access token that lasts for another 0 seconds
        if (this.accessToken){
            if (moment().utc().isBefore(moment(this.accessTokenExpiry).subtract(0,'seconds'))) {
                return true;
            }
        }
        return false;
    }

    HasCurrentRefreshToken = ():boolean => {
        try {this.ValidateAsCurrent()} catch {return false;}

        // return true if we have an refresh token that lasts for another 0 seconds
        if (this.refreshToken){
            if (moment().utc().isBefore(moment(this.refreshTokenExpiry).subtract(0,'seconds'))) {
                return true;
            }
        }
        return false;
    }

    SharingDurationExpired = ():boolean => {
        if (this.sharingEndDate){
            if (moment().utc().isBefore(moment(this.sharingEndDate).subtract(0,'seconds'))) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;        
        }
    }

    AccessTokenExpired = ():boolean => {
        if (this.accessTokenExpiry){
            if (moment().utc().isBefore(moment(this.accessTokenExpiry).subtract(0,'seconds'))) {
                return false;
            }
        }
        return true;        
    }

    RefreshTokenExpired = ():boolean => {
        if (this.refreshToken){

            // if the refreshTokenExpiry is undefined or equal to zero (this may be ), then the refresh token is not expired
            if ((this.refreshTokenExpiry || 0) === 0) {
                return false;
            }

            if (moment().utc().isBefore(moment(this.refreshTokenExpiry).subtract(0,'seconds'))) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    }

    HasScope = (scope:string):boolean => {
        if (typeof this.confirmedScopesJson != 'string') return false;

        let scopeArray:string[] = JSON.parse(this.confirmedScopesJson)
        return scopeArray.includes(scope);
    }

    MissingScopes = () => {
        const requestedScopes = JSON.parse(this.requestedScopesJson);

        let confirmedScopes: string[];
        if (typeof this.confirmedScopesJson !== 'undefined') {
            confirmedScopes = JSON.parse(this.confirmedScopesJson)
        } else {
            confirmedScopes = []
        }

        const missingScopes:string[] = _.difference(requestedScopes,confirmedScopes)
        return missingScopes;
    }

}

type ConsentRequestInitial = Pick<ConsentRequestLog,'state'|'nonce'|'adrSystemId'|'adrSystemUserId'|'dataHolderId'|'productKey'|'softwareProductId'|'redirectUri'|'requestedSharingDuration'> & {scopes:string[]} & {arrangementId?:string};
type FindConsentParams = Partial<Pick<ConsentRequestLog,'state'|'nonce'|'adrSystemId'|'adrSystemUserId'|'dataHolderId'|'productKey'|'softwareProductId'|'id'|'redirectUri'>>;

@injectable()
class ConsentRequestLogManager {

    constructor(
        @inject("Promise<Connection>") public connection:Promise<Connection>,
        @inject("Logger") private logger:winston.Logger
    ) {}

    /**
     * Checks that the the given jti is unique by logging in the database, and checking for earlier entries in the log. Could be improved for more demanding performance needs by adding indexes for further claims.
     * @param jti 
     * @param iss 
     * @param sub 
     */
    LogAuthRequest = async (req:ConsentRequestInitial) => {
        let connection = await this.connection;

        let j = new ConsentRequestLog();
        j.state = req.state
        j.nonce = req.nonce
        j.adrSystemId = req.adrSystemId
        j.dataHolderId = req.dataHolderId
        j.productKey = req.productKey
        j.softwareProductId = req.softwareProductId
        j.adrSystemUserId = req.adrSystemUserId
        j.requestDate = moment.utc().toDate()
        j.requestedScopesJson = JSON.stringify(req.scopes)
        j.redirectUri = req.redirectUri
        j.requestedSharingDuration = req.requestedSharingDuration
        j.arrangementId = req.arrangementId

        let inserted = await ((await this.connection)).manager.save(j);
        return inserted;
    }

    async IsAccessToken(token:string,dataHolderBrandId:string): Promise<boolean> {
        let connection = (await this.connection);
        let matchingConsents = await connection.manager.find(ConsentRequestLog,{accessToken: token,dataHolderId: dataHolderBrandId});
        return (matchingConsents.length > 0);
    }

    async RevokeByRefreshToken(token:string,dataHolderBrandId:string) {
        let connection = (await this.connection);
        let matchingConsent = await connection.manager.findOne(ConsentRequestLog,{refreshToken: token,dataHolderId: dataHolderBrandId});
        if (matchingConsent) {
            await this.RevokeConsent(matchingConsent,"DataHolder");
        } else {
            this.logger.info(`Tried to revoke consent with refresh token ${token}, but consent could not be found`);
        }
    }

    FindAuthRequest = async (params: FindConsentParams) => {
        let connection = await this.connection;
        let request = await ((await this.connection)).manager.findOneOrFail(ConsentRequestLog,params);
        return request;
    }

    RevokeConsent = async (consent:ConsentRequestLog, revokedAt: "DataHolder"|"DataRecipient") => {
        consent.revocationDate = moment.utc().toDate();
        consent.revokedAt = revokedAt
        await consent.save();

        this.logger.info(`Revoked consent ${consent.id}`);
        // TODO queue for deleting consents
    }

    NextRevocationToPropagate = async (cursor: ConsentRequestLog|undefined):Promise<ConsentRequestLog|undefined> => {
        let consent = await ((await this.connection)).manager.findOne(ConsentRequestLog,{
            revokedAt:"DataRecipient",
            revocationPropagationDate: IsNull(),
            revocationDate: MoreThan(moment().subtract(7,'days').toDate()),
            refreshToken: Not(IsNull()),
            id: MoreThan(cursor?.id || -1)
        })
        return consent;
    }

    MarkRevoked = async (consent:ConsentRequestLog) => {
        consent.revocationPropagationDate = moment.utc().toDate();
        consent = await consent.save();

        this.logger.info(`Revocation propagated ${consent.id}`);
        return consent;
    }

    GetConsent = async (consentId:number) => {
        let connection = await this.connection;
        let consent = await ((await this.connection)).manager.findOneOrFail(ConsentRequestLog,{id:consentId});

        return consent;
    }

    GetConsentOrUndefined = async (consentId:number) => {
        let connection = await this.connection;
        let consent = await ((await this.connection)).manager.findOne(ConsentRequestLog,{id:consentId});

        return consent;
    }

    ListConsents = async (m:{userId:string,systemId:string}) => {
        let connection = await this.connection;
        let consents = await ((await this.connection)).manager.find(ConsentRequestLog,{adrSystemUserId:m.userId, adrSystemId:m.systemId});
        return consents;
    }

    UpdateTokens = async (
        consentId: number,
        params:{
            "access_token":string,
            "token_type":string,
            "expires_in"?:number
            "refresh_token"?:string
            "scope"?:string
        },
        tokenRequestTime:Date,
        sharingEndDate?:number,
        refreshTokenExpiry?:number,
        idTokenJson?:string
    ) => {
        let consent = await ((await this.connection)).manager.findOneOrFail(ConsentRequestLog,{id: consentId});

        consent.accessToken = params.access_token;
        consent.refreshToken = params.refresh_token || consent.refreshToken;
        if (idTokenJson) {
            consent.idTokenJson = idTokenJson;
            consent.ppid = JSON.parse(idTokenJson).sub;
        }

        // TODO check all date column assignments in this file and check that they are UTC
        if (typeof sharingEndDate == 'number' && sharingEndDate > 0) {
            consent.sharingEndDate = moment(0).add(sharingEndDate,'s').toDate()
        }

        if (typeof refreshTokenExpiry == 'number' && refreshTokenExpiry > 0) {
            consent.refreshTokenExpiry = moment(0).add(refreshTokenExpiry,'s').toDate()
        }
        
        if (typeof params.expires_in == 'number') {
            try {
                consent.accessTokenExpiry = moment(tokenRequestTime).add(Math.floor(params.expires_in),'s').toDate();
            } catch {
                this.logger.error("Could not decode access token expiry")
            }
        }

        // Deal with scopes parameter if returned
        if (typeof params.scope != 'string') {
            consent.confirmedScopesJson = consent.requestedScopesJson
        } else {
            let tokenScopes = params.scope.split(' ');
            let missingScopes = _.difference(consent.requestedScopesJson,tokenScopes);
            if (missingScopes.length == 0) {
                consent.confirmedScopesJson = consent.requestedScopesJson
            } else {
                this.logger.crit('Dataholder gave token for less scopes than requested')
            }
        }

        if (!consent.consentedDate) {
            consent.consentedDate = moment.utc().toDate()
        }

        consent = await ((await this.connection)).manager.save(consent)
        return consent;
        // return await consent.save(); // seems to cause a problem in the internal test environment

    }
}

export {ConsentRequestLogManager,ConsentRequestLog}