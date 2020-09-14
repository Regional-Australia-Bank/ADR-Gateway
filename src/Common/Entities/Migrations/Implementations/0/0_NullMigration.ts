import { Migration } from "../../Migration"

export class NullMigration extends Migration {
  GetId = () => "0_Null"
  IsApplied = () => Promise.resolve(true)
  Perform = async () => undefined
  Rollback = async () => undefined
}