import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection} from "typeorm";
import {singleton, inject, injectable} from "tsyringe";
import "reflect-metadata";
import moment = require("moment");
import winston = require("winston");
import uuid = require("uuid");
import _ from "lodash"
import { RegistrationRequestParts } from "../Server/Handlers/ClientRegistration";

enum SoftwareProductStatusAtRegister {
    NONE = '',
    ACTIVE = 'ACTIVE'
}

enum SoftwareProductStatus {
    ACTIVE = 'ACTIVE',
    DELETED = 'DELETED'
}


@Entity({name: 'DhClientRegistration'})
class ClientRegistration extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    softwareProductId!: string;
    @Column()
    clientId!: string;

    @Column()
    jwks_uri!: string;

    @Column({
        type: "simple-enum",
        enum: SoftwareProductStatus,
        default: SoftwareProductStatus.ACTIVE
    })
    status!: SoftwareProductStatus;

    @Column({
        type: "simple-enum",
        enum: SoftwareProductStatusAtRegister,
        default: SoftwareProductStatusAtRegister.ACTIVE
    })
    registerStatus!: SoftwareProductStatusAtRegister;


    @Column({nullable: true})
    scopesJson?: string;

    @Column({nullable: true, length: 4000})
    requestPartsJson?: string;

    @Column({nullable: true, length: 4000})
    softwareStatement?: string;

    @Column({nullable: true})
    redirectUrisJson?: string;

    redirectUris = ():string[] => JSON.parse(this.redirectUrisJson || "[]");

    scopesArray = ():string[] => {
        if (typeof this.scopesJson != 'string') return [];
        return JSON.parse(this.scopesJson);
    }

    scopeString = () => {
        return this.scopesArray().join(" ")
    }

    @Column()
    lastUpdated!: Date;

    @Column()
    issuedAt!: Date;

}



@injectable()
class ClientRegistrationManager {
    constructor(
        @inject("Promise<Connection>") private connection:Promise<Connection>,
        @inject("Logger") private logger: winston.Logger,
        ) {

    }
   
    NewRegistration = async (softwareProductId:string, redirect_uris: string[], scope:string, jwks_uri: string, requestParts:RegistrationRequestParts, ssa:string):Promise<ClientRegistration> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(ClientRegistration);
        let [crs,count] = await repo.findAndCount({softwareProductId:softwareProductId});

        // If there is already another one, move them to the DELETED state
        if (count > 0) {
            for (let registration of crs) {
                registration.status = SoftwareProductStatus.DELETED;
                registration.lastUpdated = moment.utc().toDate();
                await registration.save();
            }
        }

        let c = new ClientRegistration();
        c.softwareProductId = softwareProductId;
        c.clientId = uuid.v4();
        c.issuedAt = moment.utc().toDate();
        c.lastUpdated = c.issuedAt;
        c.status = SoftwareProductStatus.ACTIVE;
        c.registerStatus = SoftwareProductStatusAtRegister.ACTIVE;
        c.redirectUrisJson = JSON.stringify(redirect_uris);
        c.jwks_uri = jwks_uri;
        c.scopesJson = JSON.stringify(_.uniq(scope.split(" ")))
        c.requestPartsJson = JSON.stringify(requestParts)
        c.softwareStatement = ssa
        return await resolvedConnection.getRepository(ClientRegistration).save(c);
    }

    UpdateRegistration = async (clientId:string, softwareProductId:string, redirect_uris: string[], scope:string, jwks_uri: string, requestParts:RegistrationRequestParts, ssa:string):Promise<ClientRegistration> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(ClientRegistration);
        let [crs,count] = await repo.findAndCount({softwareProductId:softwareProductId, clientId: clientId, status: SoftwareProductStatus.ACTIVE});

        if (count != 1) {
            throw 'Expected exactly one active registration matching productId and clientId'
        }

        let reg = crs[0]

        reg.lastUpdated = moment().utc().toDate();
        reg.status = SoftwareProductStatus.ACTIVE;
        reg.registerStatus = SoftwareProductStatusAtRegister.ACTIVE; // TODO fix, or alternatively remove, on other operations in this class also
        reg.redirectUrisJson = JSON.stringify(redirect_uris);
        reg.jwks_uri = jwks_uri;
        reg.scopesJson = JSON.stringify(_.uniq(scope.split(" ")))
        reg.requestPartsJson = JSON.stringify(requestParts)
        reg.softwareStatement = ssa
        return await reg.save()
    }

    GetRegistration = async(clientId:string): Promise<ClientRegistration|undefined> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(ClientRegistration);
        let [crs,count] = await repo.findAndCount({clientId:clientId, status: SoftwareProductStatus.ACTIVE});

        // If there is already another one, move them to the DELETED state
        if (count != 1) {
            return undefined
        }

        return crs[0];
    }
}

export {ClientRegistrationManager,ClientRegistration,SoftwareProductStatus}