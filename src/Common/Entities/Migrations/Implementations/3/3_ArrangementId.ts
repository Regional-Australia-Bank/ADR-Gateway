import { Migration } from "../../Migration";
import { Connection, TableColumn } from "typeorm";
import _ from "lodash"
import moment from "moment";

export class AddArrangementIdMigration extends Migration {
  GetId = () => "3_AddArrangementIdMigration";
  IsApplied = async (connection: Connection) => {
    const tableName = `${connection.options.entityPrefix || ""}MigrationLog`;

    let [q,p] = connection.driver.escapeQueryWithParameters(`SELECT performed FROM ${connection.driver.escape(tableName)} where id = :id;`,{id:this.GetId()},{})

    const results = await connection
      .createQueryRunner()
      .query(q,p);

    if (results.length !== 1) {
      return false
    } else {
      return true
    }
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