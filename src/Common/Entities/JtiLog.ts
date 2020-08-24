import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection} from "typeorm";
import {singleton, inject, injectable} from "tsyringe";
import "reflect-metadata";

@Entity()
class JtiLog extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;
    @Column()
    jti!: string;
    @Column()
    iss!: string;
    @Column()
    sub!: string;
}

@injectable()
class JtiLogManager {
    /**
     * Checks that the the given jti is unique by logging in the database, and checking for earlier entries in the log. Could be improved for more demanding performance needs by adding indexes for further claims.
     * @param jti 
     * @param iss 
     * @param sub 
     */
    constructor(@inject("Promise<Connection>") private connection:Promise<Connection>) {

    }

    async IsJtiUnique(jti:string,iss:string,sub:string):Promise<boolean> {
        try {
            let resolvedConnection = (await this.connection);

            let j = new JtiLog();
            j.jti = jti
            j.iss = iss
            j.sub = sub
            
            let inserted = await resolvedConnection.manager.save(j);

            let duplicateEntries = await resolvedConnection.manager.find(JtiLog,{
                iss: inserted.iss,
                jti: inserted.jti,
                sub: inserted.sub,
                id: Not(inserted.id)
            });

            if (duplicateEntries.length > 0) {
                return false;
            } else {
                return true;
            }
        } catch (err) {
            throw(err);
        }
    }
}

export {JtiLogManager,JtiLog}