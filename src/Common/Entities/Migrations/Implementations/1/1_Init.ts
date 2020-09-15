import { Migration } from "../../Migration";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "./JtiLog";
import { DataHolderRegistration } from "./DataHolderRegistration";
import { ConsentRequestLog } from "./ConsentRequestLog";
import { MigrationDbConfig } from "../../Config";
import _ from "lodash"

export class InitMigration extends Migration {
  GetId = () => "1_Init";
  IsApplied = async (connection:Connection) => {
    const allTables = await connection.createQueryRunner().getTables([connection.options.entityPrefix+"consent_request_log"]);
    if (allTables.length == 1) {
      return true
    } else {
      return false
    }
  }

  Perform = async (connection: Connection) => {
    await connection.synchronize();
  }

  Rollback = async (connection: Connection) => {
    throw "No Rollback for init migration"
  }
}