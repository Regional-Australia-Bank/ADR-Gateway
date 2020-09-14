import { configure } from "./Config";
import { doMigrations } from "./MigrationSequence";

const getTargetVersion = async () => {
  return process.env.ADR_GATEWAY_MIGRATION_TARGET_VERSION;
}

const main = async () => {

  const config = configure();
  console.log("Database config")
  console.log(config)

  const targetVersion = await getTargetVersion();
  console.log(`Target version: ${targetVersion || "LATEST"}`)

  await doMigrations(config,targetVersion);

  console.log(`Migration done.`)

}

main();