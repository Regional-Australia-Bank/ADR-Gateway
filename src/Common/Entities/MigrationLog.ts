import {Entity, Column, BaseEntity,PrimaryGeneratedColumn} from "typeorm";
import "reflect-metadata";

@Entity()
export class MigrationLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: string;
    @Column()
    performed!: Date;
}