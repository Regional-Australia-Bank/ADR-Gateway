import { Migration } from "../../Migration";
import { Connection, createConnection } from "typeorm";
import { JtiLog } from "./JtiLog";
import { DataHolderRegistration } from "./DataHolderRegistration";
import { ConsentRequestLog } from "./ConsentRequestLog";
import { MigrationDbConfig } from "../../Config";
import _ from "lodash"

export const Version1Entities = [ConsentRequestLog, DataHolderRegistration, JtiLog];

export class InitMigration extends Migration {
  GetId = () => "1_Init";
  IsApplied = async (connection:Connection) => {
    try {
      await connection.manager.count(ConsentRequestLog)
    } catch {
      return false;
    }
    return true;
  }

  Perform = async (connection: Connection) => {
    await connection.synchronize();
  }

  Rollback = async (connection: Connection) => {
    throw "No Rollback for init migration"
  }
}