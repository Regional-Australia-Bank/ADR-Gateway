import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection, MoreThanOrEqual} from "typeorm";
import {singleton, inject, injectable} from "tsyringe";
import "reflect-metadata";
import moment = require("moment");
import winston = require("winston");
import { resolve } from "path";
import { CdsScope } from "../../../Common/SecurityProfile/Scope";
import uuid = require("uuid");
import { IssuerSpec } from "../Server/Helpers/TokenConfigProviders";

const {Entropy,charset64} = require("entropy-string")
const entropy256bit = new Entropy({ charset: charset64, bits: 256 })


enum TokenRevocationStatus {
    NONE = '',
    ACTIVE = 'active',
    REVOKED = 'revoked'
}

enum AuthCodeStatus {
    NONE = '',
    READY = 'ready',
    CONSUMED = 'consumed'
}

@Entity({name: 'DhConsent'})
class Consent extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    sharingDurationSeconds!: number;

    @Column({nullable: true})
    subjectPpid?: string; // the PPID provided via the ID Token

    @Column()
    cdr_arrangement_id!: string; // the PPID provided via the ID Token
    
    @Column({nullable: true})
    secretSubjectId?: string; // the PPID provided via the ID Token

    @Column({nullable: true})
    clientCertThumbprint?: string; // thumbprint of cert used for gaining access token

    @Column({
        type: "simple-enum",
        enum: TokenRevocationStatus,
        default: TokenRevocationStatus.ACTIVE
    })
    tokenRevocationStatus!: TokenRevocationStatus;

    @Column({
        type: "simple-enum",
        enum: AuthCodeStatus,
        default: AuthCodeStatus.NONE
    })
    authCodeStatus!: AuthCodeStatus;

    @Column({nullable: true})
    tokenRevocationDate?: Date;
    
    @Column({nullable: true})
    refreshToken?: string;
    
    @Column({nullable: true})
    accessToken?: string;

    @Column({nullable: true})
    authCode?: string;

    @Column()
    drAppClientId!: string // The id of the client which will be used for HoK mechanism
    
    @Column()
    redirect_uri!: string; // the PPID provided via the ID Token
    
    @Column()
    requestedScopesJson!: string;

    @Column({nullable: true})
    scopesJson?: string;

    scopesArray = ():string[] => {
        if (typeof this.scopesJson != 'string') return [];
        return JSON.parse(this.scopesJson);
    }

    @Column({nullable: true})
    state?: string;
    @Column({nullable: true})
    nonce?: string;
    // @Column()
    // nonce!: string;
    @Column()
    requestDate!: Date;

    @Column({nullable: true})
    consentConfirmedDate?: Date;

    @Column({nullable: true})
    accessTokenExpires?: Date;

    @Column({nullable: true})
    refreshTokenExpires?: Date;

    refreshTokenExpiresNumericDate = () => {
        if (typeof this.refreshTokenExpires == 'undefined') return 0
        return Math.floor(moment(this.refreshTokenExpires).utc().unix())
    }

    SharingExpiresNumericDate = () => {
        if (this.sharingDurationSeconds == 0) return 0;
        return Math.floor(moment(this.requestDate).add(this.sharingDurationSeconds,'s').unix());
    }


    @Column({nullable: true})
    authCodeExpires?: Date;

    static AssertValidAndCurrent = (consent:Consent|undefined):Consent => {
        if (typeof consent == 'undefined') throw 'consent request could not be found 1';

        if (consent.tokenRevocationStatus == TokenRevocationStatus.REVOKED ) throw 'The consent has been revoked';
        if (consent.refreshTokenExpires && moment(consent.refreshTokenExpires).isBefore(moment.utc())) throw 'The refresh token has expired';
        if (typeof consent.authCodeExpires == 'undefined' ) throw 'The auth code has an invalid expiry';
        if (typeof moment(consent.authCodeExpires).isBefore(moment.utc()) == 'undefined' ) throw 'The auth code has expired';
        if (typeof moment(consent.consentConfirmedDate).add(consent.sharingDurationSeconds,'seconds').isBefore(moment.utc()) == 'undefined' ) throw 'The consent has expired';   

        return consent;
    }

}

type ConsentRequestInitial = Pick<Consent,'state'|'drAppClientId'|'sharingDurationSeconds'|'nonce'|'redirect_uri'> & {scopes:string[]} & {existingArrangementId?:string};
type FindConsentParams = Partial<Pick<Consent,'state'|'drAppClientId'|'id'>>;


@injectable()
class ConsentManager {
    constructor(
        @inject("Promise<Connection>") private connection:Promise<Connection>,
        @inject("Logger") private logger: winston.Logger,
        @inject("TokenIssuerConfig") private issuer:IssuerSpec
        ) {

    }

    // TODO support refresh_token_expires_at and sharing_expires_at in ID Token
    RegenerateTokens = async (consent: Consent, clientCertThumbprint: string, accessTokenLifetimeSeconds: number, refreshTokenLifetimeDays: number) => {
        //regenerate tokens:
        consent.accessToken = entropy256bit.string();
        if (consent.sharingDurationSeconds > 0 ) {
            consent.refreshToken = entropy256bit.string();
            let sharingEndTime = moment(consent.consentConfirmedDate).add(consent.sharingDurationSeconds,'seconds');
            let fromNow28DaysForward = moment.utc().add(refreshTokenLifetimeDays,"days");
            // let the token last the earlier of (1) 28 days from now, (2) the end time of the sharing agreement.
            if (fromNow28DaysForward.isAfter(sharingEndTime)) {
                consent.refreshTokenExpires = sharingEndTime.toDate();
            } else {
                consent.refreshTokenExpires = fromNow28DaysForward.toDate();
            }
        }
        consent.accessTokenExpires = moment.utc().add(accessTokenLifetimeSeconds,"seconds").toDate();

        //invalidate authCode
        consent.authCode = undefined;
        consent.authCodeStatus = AuthCodeStatus.CONSUMED;
        consent.clientCertThumbprint = clientCertThumbprint;
        //this.accessTokenExpires = 

        return await (await this.connection).getRepository(Consent).save(consent);
    }


    revokeArrangement = async (cdr_arrangement_id:string,drAppClientId:string, accessToken:string):Promise<void> => {
        let resolvedConnection = (await this.connection);

        let matchingConsents = await resolvedConnection.manager.find(Consent,{cdr_arrangement_id, drAppClientId: drAppClientId, accessToken});

        this.logger.debug({
            action: "Revoke arrangement",
            cdr_arrangement_id,
            drAppClientId: drAppClientId,
            countMatching: matchingConsents.length
        })

        for (let consent of matchingConsents) {
            consent.refreshToken = undefined;
            consent.tokenRevocationStatus = TokenRevocationStatus.REVOKED;
            consent.tokenRevocationDate = moment.utc().toDate()
            let revoked = await resolvedConnection.manager.save(consent);
            this.logger.info({"Revoked consent": revoked});
        }
        return;
    }

    revokeRefreshToken = async (token:string,drAppClientId:string):Promise<void> => {
        let resolvedConnection = (await this.connection);

        let matchingConsents = await resolvedConnection.manager.find(Consent,{refreshToken: token, drAppClientId: drAppClientId});

        this.logger.debug({
            action: "Revoke Refresh Token",
            token: token,
            drAppClientId: drAppClientId,
            countMatching: matchingConsents.length
        })

        for (let consent of matchingConsents) {
            consent.refreshToken = undefined;
            consent.tokenRevocationStatus = TokenRevocationStatus.REVOKED;
            consent.tokenRevocationDate = moment.utc().toDate()
            let revoked = await resolvedConnection.manager.save(consent);
            this.logger.info({"Revoked consent": revoked});
        }
        return;
    }

    revokeAccessToken = async (token:string,drAppClientId:string):Promise<void> => {
        let resolvedConnection = (await this.connection);

        let matchingConsents = await resolvedConnection.manager.find(Consent,{accessToken: token, drAppClientId: drAppClientId});

        this.logger.debug({
            action: "Revoke Access Token",
            token: token,
            drAppClientId: drAppClientId,
            countMatching: matchingConsents.length
        })

        for (let consent of matchingConsents) {
            consent.accessToken = null;
            consent.accessTokenExpires = null;
            let revoked = await resolvedConnection.manager.save(consent);
            this.logger.info({"Revoked access token": revoked});
        }
        return;
    }


    GetById = async (id:number): Promise<Consent|undefined> => {
        let resolvedConnection = (await this.connection);
        let matchingConsent = await resolvedConnection.manager.findOne(Consent,{id});
        return matchingConsent;
    }

    isAccessToken = async (token:string,drAppClientId:string): Promise<boolean> => {
        let resolvedConnection = (await this.connection);
        let matchingConsents = await resolvedConnection.manager.find(Consent,{accessToken: token,drAppClientId: drAppClientId});
        return (matchingConsents.length > 0);
    }

    getActiveConsentByAccessToken = async (token:string,thumbprint:string,subjectPpid:string|undefined): Promise<Consent> => {
        let resolvedConnection = (await this.connection);
        let findOptions:any = {
            accessToken: token,
            clientCertThumbprint: thumbprint,
            // subjectPpid: subjectPpid,
            tokenRevocationStatus: Not(TokenRevocationStatus.REVOKED),
            accessTokenExpires: MoreThanOrEqual(moment().utc().toDate())
        };
        if (subjectPpid) {findOptions.subjectPpid = subjectPpid}
        let matchingConsent = await resolvedConnection.manager.findOneOrFail(
            Consent,findOptions);
        return matchingConsent;
    }

    // TODO ensure that an ID cannot be confirmed multiple times (potential security risk)
    confirmConsent = async (id: number, confirmation: {subjectPpid: string, personId: string, scopes: string[], authCode: string}) => {
        let resolvedConnection = (await this.connection);
        let consent = await resolvedConnection.getRepository(Consent).findOne({id: id});
        if (typeof consent == 'undefined') throw 'consent request could not be found 2'

        consent.subjectPpid = confirmation.subjectPpid;
        consent.secretSubjectId = confirmation.personId;
        consent.scopesJson = JSON.stringify(confirmation.scopes);
        consent.authCode = confirmation.authCode;
        consent.authCodeStatus = AuthCodeStatus.READY;
        // TODO confirm validity period for auth token
        consent.authCodeExpires = moment.utc().add(this.issuer.authTokenExpirySeconds,'seconds').toDate();
        consent.consentConfirmedDate = moment.utc().toDate();
        return await resolvedConnection.getRepository(Consent).save(consent);
    }

    getConsentRequestState = async (id: number) => {
        let resolvedConnection = (await this.connection);
        let consent = await resolvedConnection.getRepository(Consent).findOne({id: id});   
        if (typeof consent == 'undefined') throw 'consent request could not be found 3';
        return consent;
    }

    getTokenByAuthCode = async (params: {code: string, client_id:string}, clientCertThumbprint:string) => {
        let resolvedConnection = (await this.connection);
        let consent = await resolvedConnection.getRepository(Consent).findOne({
            authCode: params.code,
            drAppClientId:params.client_id,
            authCodeStatus: AuthCodeStatus.READY
        });   

        try {
            consent = Consent.AssertValidAndCurrent(consent);                  
        } catch {
            throw 'Consent.AssertValidAndCurrent error'
        }

        return await this.RegenerateTokens(consent,clientCertThumbprint,this.issuer.accessTokenExpirySeconds,this.issuer.refreshTokenExpiryDays);;
        // TODO error handling as per 3.1.3.4 https://openid.net/specs/openid-connect-core-1_0.html
    }

    getConsentByRefreshToken = async (params: {refresh_token: string, client_id:string}) => {
        let resolvedConnection = (await this.connection);
        let consent = await resolvedConnection.getRepository(Consent).findOne({
            refreshToken: params.refresh_token,
            drAppClientId:params.client_id,
            authCodeStatus: AuthCodeStatus.CONSUMED
        });   

        return consent

    }

    getTokenByRefreshToken = async (params: {refresh_token: string, client_id:string}, clientCertThumbprint:string) => {
        let consent:Consent;
        try {
            consent = await this.getConsentByRefreshToken(params);
            consent = Consent.AssertValidAndCurrent(consent);                  
        } catch {
            throw 'Consent.AssertValidAndCurrent error'
        }
        return await this.RegenerateTokens(consent,clientCertThumbprint,this.issuer.accessTokenExpirySeconds,this.issuer.refreshTokenExpiryDays);;

        // TODO error handling as per 3.1.3.4 https://openid.net/specs/openid-connect-core-1_0.html
        // TODO error handling as per 3.1.3.4 https://openid.net/specs/openid-connect-core-1_0.html
    }

    requestConsent = async (req: ConsentRequestInitial) => {
        const secondsInOneYear = 365 * 24 * 60 * 60;

        let resolvedConnection = (await this.connection);
        let c = new Consent();
        c.drAppClientId = req.drAppClientId;
        c.requestedScopesJson = JSON.stringify(req.scopes);
        c.tokenRevocationStatus = TokenRevocationStatus.NONE;
        c.authCodeStatus = AuthCodeStatus.NONE;
        c.requestDate = moment.utc().toDate();
        c.state = req.state
        c.nonce = req.nonce
        c.sharingDurationSeconds = req.sharingDurationSeconds
        c.redirect_uri = req.redirect_uri

        // Assign arrangement ID if not provided
        c.cdr_arrangement_id = req.existingArrangementId || uuid.v4()

        // TODO test this
        if (typeof c.sharingDurationSeconds != 'number') c.sharingDurationSeconds = 0;
        if (c.sharingDurationSeconds > secondsInOneYear) c.sharingDurationSeconds = secondsInOneYear;
        // c.nonce = req.nonce
        return await resolvedConnection.getRepository(Consent).save(c);
    }

    
    newTestConsent = async (refreshToken: string, accessToken: string | undefined, subjectId:string, drAppClientId:string, scopes:CdsScope[]) => {
        let resolvedConnection = (await this.connection);
        let c = new Consent();
        c.refreshToken = refreshToken;
        c.accessToken = accessToken;
        c.drAppClientId = drAppClientId;
        c.subjectPpid = subjectId;
        c.requestDate = moment.utc().toDate();
        c.scopesJson = JSON.stringify(scopes);
        c.state = "test-state";
        c.sharingDurationSeconds = 31*24*3600 // one month
        c.requestedScopesJson = JSON.stringify(scopes);
        c.tokenRevocationStatus = TokenRevocationStatus.NONE;
        c.authCodeStatus = AuthCodeStatus.NONE;
        c.accessTokenExpires = moment().add(1,"month").toDate();
        c.redirect_uri = "test-redirect";
        await resolvedConnection.getRepository(Consent).save(c);
    }
}

export {ConsentManager,Consent,TokenRevocationStatus}