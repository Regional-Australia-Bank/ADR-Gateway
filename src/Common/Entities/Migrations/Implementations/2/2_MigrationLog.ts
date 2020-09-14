import { Migration } from "../../Migration";
import { Connection, createConnection, Table } from "typeorm";
import _ from "lodash"

export class MigrationLogMigration extends Migration {
  GetId = () => "2_MigrationLog";
  IsApplied = async (db: Connection) => {
    const connection = db;
    try {
      await connection.createQueryRunner().getTable(`${db.options.entityPrefix || ""}MigrationLog`);
    } catch {
      return false;
    }
    return true;
  }

  Perform = async (db: Connection) => {
    await db.createQueryRunner().createTable(new Table({
      name: `${db.options.entityPrefix || ""}MigrationLog`,
      columns: [{
        name: "id",
        type: "varchar",
        length: "255"
      },{
        name: "performed",
        type: "varchar",
        length: "40"
      }]
    }))
  }

  Rollback = async () => {
    throw "No Rollback for this migration"
  }
}