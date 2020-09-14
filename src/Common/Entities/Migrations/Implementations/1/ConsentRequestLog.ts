import {Entity, Column, BaseEntity,PrimaryGeneratedColumn} from "typeorm";
import "reflect-metadata";


@Entity()
export class ConsentRequestLog extends BaseEntity {
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
    @Column({nullable: true, length:4000})
    refreshToken?: string;
}