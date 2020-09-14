import { InitMigration } from "./Implementations/1/1_Init";
import { Migration } from "./Migration";
import { NullMigration } from "./Implementations/0/0_NullMigration";
import { MigrationLogMigration } from "./Implementations/2/2_MigrationLog";
import { AddArrangementIdMigration } from "./Implementations/3/3_ArrangementId";
import _ from "lodash"
import { Connection } from "typeorm";
import { logger } from "./Logger";

const MigrationSequence:Migration[] = [
  new NullMigration(),
  new InitMigration(),
  new MigrationLogMigration(),
  new AddArrangementIdMigration()
]

export const doMigrations = async (db: Connection, targetVersion?: string) => {

  logger.info("Available migrations: ")
  logger.info(MigrationSequence.map(m => m.GetId()))

  let lastApplied = -1
  for (let i = 0; i<MigrationSequence.length; i++) {
    let m = MigrationSequence[i];
    if (await m.IsApplied(db)) {
      logger.info(`Migration is already applied: ${m.GetId()}`)
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

  logger.info("Migrations to do: ")
  logger.info(todo.map(m => m.GetId()))

  let current:Migration;
  const done:Migration[] = []
  try {
    for (let migration of todo) {
      current = migration;
      logger.info(`Migrating to ${migration.GetId()}`)
      await migration.Perform(db)
      done.push()
    }
  } catch (error) {
    logger.error(error);
    logger.error("Attempting to roll back current migration")
    try {
      current.Rollback(db)
    } catch (e) {
      logger.warn(e)
    }
    logger.error("Attempting to roll back previous migrations")
    for (let d = done.length - 1; d >= 0; d--) {
      done[d].Rollback(db)
    }

    throw 'Migration failed'
  }
}