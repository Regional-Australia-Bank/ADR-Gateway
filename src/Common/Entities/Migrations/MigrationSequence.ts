import { InitMigration, Version1Entities } from "./Implementations/1/1_Init";
import { Migration } from "./Migration";
import { MigrationDbConfig } from "./Config";
import { Connection, createConnection } from "typeorm";
import { NullMigration } from "./Implementations/0/0_NullMigration";
import { MigrationLogMigration } from "./Implementations/2/2_MigrationLog";
import { AddArrangementIdMigration } from "./Implementations/3/3_ArrangementId";
import _ from "lodash"

const EntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: "adr_",
  synchronize: false,
  logging: ["query"],
  entities: Version1Entities
};

const connect = async (config:MigrationDbConfig, db?: Promise<Connection>) => {
  const connectionPromise = db || (() => {
    let options = _.merge(EntityDefaults, config.Database);
    return createConnection(options)

  })()

  return await connectionPromise;
}

const MigrationSequence:Migration[] = [
  new NullMigration(),
  new InitMigration(),
  new MigrationLogMigration(),
  new AddArrangementIdMigration()
]

export const doMigrations = async (config: MigrationDbConfig, targetVersion?: string) => {

  let db = await connect(config);

  console.log("Available migrations: ")
  console.log(MigrationSequence.map(m => m.GetId()))

  let lastApplied = -1
  for (let i = 0; i<MigrationSequence.length; i++) {
    let m = MigrationSequence[i];
    if (await m.IsApplied(db)) {
      console.log(`Migration is already applied: ${m.GetId()}`)
      lastApplied = i;
    } else {
      break;
    }
  }

  let todo = MigrationSequence.slice(lastApplied+1);

  if (targetVersion) {
    let i = todo.findIndex(m => m.GetId() == targetVersion);
    if (i < 0) throw `Target version ${targetVersion} is not in front of the currnt state`;
    todo = todo.slice(0,i + 1)
  }

  console.log("Migrations to do: ")
  console.log(todo.map(m => m.GetId()))

  let current:Migration;
  const done:Migration[] = []
  try {
    for (let migration of todo) {
      current = migration;
      console.log(`Migrating to ${migration.GetId()}`)
      await migration.Perform(db)
      done.push()
    }
    await db.close()
  } catch (error) {
    console.error(error);
    console.error("Attempting to roll back current migration")
    try {
      current.Rollback(db)
    } catch (e) {
      console.warn(e)
    }
    console.error("Attempting to roll back previous migrations")
    for (let d = done.length - 1; d >= 0; d--) {
      done[d].Rollback(db)
    }

    throw 'Migration failed'
  }
}