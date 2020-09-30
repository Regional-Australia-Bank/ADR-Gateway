import { configure } from "./Config";
import { doMigrations } from "./MigrationSequence";
import { Connection, createConnection } from "typeorm";
import { MigrationDbConfig } from "./Config";
import _ from "lodash"
import { Version1EntityDefaults } from "./Bootstrap";
import { logger } from "./Logger";


const getTargetVersion = async () => {
  return process.env.ADR_GATEWAY_MIGRATION_TARGET_VERSION;
}

const connect = async (config:MigrationDbConfig, db?: Promise<Connection>) => {
  const connectionPromise = db || (() => {
    let options = _.merge(Version1EntityDefaults, config.Database);
    return createConnection(options)

  })()

  return await connectionPromise;
}

const main = async () => {

  const config = configure();
  let db = await connect(config);

  const targetVersion = await getTargetVersion();
  logger.info(`Target version: ${targetVersion || "LATEST"}`)

  await doMigrations(db,targetVersion);

  logger.info(`Migration done.`)
  process.exit(0); // Looks like await db.close() is not working in some places.

}

main().catch(() => process.exit(1));