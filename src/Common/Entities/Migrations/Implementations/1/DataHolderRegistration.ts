import {Entity, Column, BaseEntity,PrimaryGeneratedColumn} from "typeorm";
import "reflect-metadata";

enum RegistrationStatus {
    CURRENT = 'CURRENT',
    DELETED = 'DELETED'
}

@Entity({name: 'AdrDataHolderRegistration'})
export class DataHolderRegistration extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    softwareProductId!: string;

    @Column()
    dataholderBrandId!: string;

    @Column()
    clientId!: string;

    @Column({
        type: "simple-enum",
        enum: RegistrationStatus,
        default: RegistrationStatus.CURRENT
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

    @Column()
    lastUpdated!: Date;

    @Column()
    issuedAt!: Date;

}