import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection} from "typeorm";
import {singleton, inject, injectable} from "tsyringe";
import "reflect-metadata";
import moment = require("moment");

@Entity()
class MetadataUpdateLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;
    @Column()
    requested!: Date;
    @Column({nullable: true})
    completed?: Date;
}


@injectable()
class MetadataUpdateLogManager {
    constructor(@inject("Promise<Connection>") private connection:Promise<Connection>) {

    }

    async update():Promise<MetadataUpdateLog> {
        let resolvedConnection = (await this.connection);

        let j = new MetadataUpdateLog();
        j.requested = moment.utc().toDate()
        j.completed = undefined
        
        let inserted = await resolvedConnection.manager.save(j);

        return inserted;
    }
}

export {MetadataUpdateLogManager,MetadataUpdateLog}