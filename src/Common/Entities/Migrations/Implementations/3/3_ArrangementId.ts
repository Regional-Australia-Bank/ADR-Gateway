import { Migration } from "../../Migration";
import { Connection, createConnection, TableColumn } from "typeorm";
import { MigrationDbConfig } from "../../Config";
import _ from "lodash"
import { MigrationLog } from "../../../MigrationLog";
import { ConsentRequestLog } from "../../../ConsentRequestLog";
import moment from "moment";

const EntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: "adr_",
  synchronize: false,
  logging: ["query","error","warn"],
  entities: [MigrationLog,ConsentRequestLog]
};

const connect = async (config:MigrationDbConfig, db?: Promise<Connection>) => {
  const connectionPromise = db || (() => {
    let options = _.merge(EntityDefaults, config.Database);
    return createConnection(options)

  })()

  return await connectionPromise;
}

export class AddArrangementIdMigration extends Migration {
  GetId = () => "3_AddArrangementIdMigration";
  IsApplied = async (connection: Connection) => {
    try {
      const applicationCount = await connection.createQueryBuilder().from(`${connection.options.entityPrefix || ""}MigrationLog`,"ml").where({id:"3_AddArrangementIdMigration"}).getCount()
      if (applicationCount !== 1) throw "No matching log entry"
    } catch {
      return false;
    }
    return true;
  }

  Perform = async (connection:Connection) => {
    const runner = connection.createQueryRunner("master");
    const tableName = (connection.options.entityPrefix || "")+'consent_request_log';
    await runner.addColumn(tableName,new TableColumn({
      isNullable:true,
      type:"varchar",
      name:"arrangementId",
      length: "255"
    }))

    const values = {
      id: "3_AddArrangementIdMigration",
      performed: moment().utc().toISOString()
    }
    await connection.createQueryBuilder().insert().into(`${connection.options.entityPrefix || ""}MigrationLog`,["id","performed"]).values(values).execute()
  }

  Rollback = async () => {
    throw "No Rollback for this migration"
  }
}