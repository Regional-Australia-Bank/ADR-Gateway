import { MigrationDbConfig } from "./Config"
import { Connection } from "typeorm"

export abstract class Migration {
  abstract GetId:() => string
  abstract IsApplied:(db: Connection) => Promise<boolean>
  abstract Perform:(db: Connection) => Promise<void>
  abstract Rollback:(db: Connection) => Promise<void>
}