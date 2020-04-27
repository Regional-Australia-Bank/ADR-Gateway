import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, createConnection, Connection, MoreThanOrEqual} from "typeorm";
import {singleton, inject, injectable} from "tsyringe";
import "reflect-metadata";
import moment = require("moment");
import winston = require("winston");
import uuid = require("uuid");
import { DataholderRegistrationResponse } from "../Server/Connectivity/Neurons/DataholderRegistration";
import _ from "lodash"

@Entity({name: 'AdrDataHolderRegistration'})
class DataHolderRegistration extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    softwareProductId!: string;

    @Column()
    dataholderBrandId!: string;

    @Column()
    clientId!: string;

    @Column({
        type: "simple-enum"
    })
    status!: RegistrationStatus;

    @Column()
    redirectUrlsJson!: string;

    @Column()
    scopesJson!: string;

    redirectUrls = () => {
        return JSON.parse(this.redirectUrlsJson);
    }

    scopes = () => {
        return JSON.parse(this.scopesJson);
    }

    // @Column()
    // logo_uri!: string;
    // @Column()
    // tos_uri!: string;
    // @Column()
    // policy_uri!: string;
    // @Column()
    // jwks_uri!: string;
    // @Column()
    // revocation_uri!: string;

    @Column()
    lastUpdated!: Date;

    @Column()
    issuedAt!: Date;

}

enum RegistrationStatus {
    CURRENT = 'CURRENT',
    DELETED = 'DELETED'
}

@injectable()
class DataHolderRegistrationManager {
    constructor(
        @inject("Promise<Connection>") private connection:Promise<Connection>,
        @inject("Logger") private logger: winston.Logger,
        ) {

    }
   
    NewRegistration = async (r:DataholderRegistrationResponse,dataholderBrandId:string):Promise<DataHolderRegistration> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(DataHolderRegistration);
        let [crs,count] = await repo.findAndCount({softwareProductId:r.software_id, dataholderBrandId: dataholderBrandId});

        if (count > 0) {
            for (let registration of crs) {
                registration.status = RegistrationStatus.DELETED;
                registration.lastUpdated = moment.utc().toDate();
                await registration.save();
            }
        }

        let c = new DataHolderRegistration();
        c.softwareProductId = r.software_id;
        c.dataholderBrandId = dataholderBrandId;
        c.clientId = r.client_id;
        c.issuedAt = (typeof r.client_id_issued_at != 'number')? moment.utc().toDate() : moment(r.client_id_issued_at*1000).utc().toDate();
        c.lastUpdated = moment.utc().toDate();
        c.redirectUrlsJson = JSON.stringify(r.redirect_uris)
        c.scopesJson = JSON.stringify(_.uniq(r.scope.split(" ")))
        c.status = RegistrationStatus.CURRENT;
        return await resolvedConnection.getRepository(DataHolderRegistration).save(c);
    }

    UpdateRegistration = async (r:DataholderRegistrationResponse,dataholderBrandId:string):Promise<DataHolderRegistration> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(DataHolderRegistration);
        let [crs,count] = await repo.findAndCount({softwareProductId:r.software_id, clientId: r.client_id, status: RegistrationStatus.CURRENT, dataholderBrandId});

        if (count != 1) throw 'Expected to find exactly one current registration with clientId and softwareProductid'

        let c = crs[0]

        c.softwareProductId = r.software_id;
        c.clientId = r.client_id;
        c.lastUpdated = moment.utc().toDate();
        c.redirectUrlsJson = JSON.stringify(r.redirect_uris) // TODO not sure if redirectUrlsJson and scopesJson need to be stored locally. Probably not
        c.scopesJson = JSON.stringify(_.uniq(r.scope.split(" ")))
        c.status = RegistrationStatus.CURRENT;

        return await resolvedConnection.getRepository(DataHolderRegistration).save(c);
    }

    GetActiveRegistrationByIds = async (softwareProductId:string,dataholderBrandId:string):Promise<DataHolderRegistration|undefined> => {
        let resolvedConnection = (await this.connection);
        const repo = resolvedConnection.getRepository(DataHolderRegistration);

        let [crs,count] = await repo.findAndCount({
            softwareProductId:softwareProductId,
            dataholderBrandId:dataholderBrandId,
            status: RegistrationStatus.CURRENT
        });

        if (count == 0) return undefined;
        if (count > 1) throw 'Too many active registrations for this software product. Expected exactly 1.'

        return crs[0];

    }
}

export {DataHolderRegistrationManager,DataHolderRegistration,RegistrationStatus}