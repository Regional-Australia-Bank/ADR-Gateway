import {Not,Entity, Column, BaseEntity,PrimaryGeneratedColumn, Connection} from "typeorm";
import {singleton,inject, injectable} from "tsyringe";
import "reflect-metadata";

@Entity()
class ClientJwks extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;
    @Column()
    clientId!: string;
    @Column()
    jwks!: string;
}

@injectable()
class ClientJwksManager {

    constructor(@inject("Promise<Connection>") public connection:Promise<Connection>) {

    }

    /**
     * Checks that the the given jti is unique by logging in the database, and checking for earlier entries in the log. Could be improved for more demanding performance needs by adding indexes for further claims.
     * @param jti 
     * @param iss 
     * @param sub 
     */
    async GetJwksJson(clientId:string):Promise<ClientJwks> {
        let connection = await this.connection;
        let jwks = await connection.manager.findOne(ClientJwks,{
            clientId: clientId
        });
        if (typeof jwks == 'undefined') throw new Error("Client jwks does not exist")
        return jwks;
    }

    async InsertJwksJson(clientId:string,jwks:string) {
        let connection = await this.connection;
        console.log(`InsertJwksJson: connection isConnected: ${connection.isConnected}`);
        let existing = await (connection).manager.find(ClientJwks,{
            clientId: clientId,
        });
        existing.forEach((i)=> {i.remove()})

        let j = new ClientJwks();
        j.clientId = clientId;
        j.jwks = jwks;

        let inserted = await ((await this.connection)).manager.save(j);
    }
}

export {ClientJwksManager,ClientJwks}