import {Entity, Column, BaseEntity,PrimaryGeneratedColumn} from "typeorm";
import "reflect-metadata";

@Entity()
export class JtiLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;
    @Column()
    jti!: string;
    @Column()
    iss!: string;
    @Column()
    sub!: string;
}