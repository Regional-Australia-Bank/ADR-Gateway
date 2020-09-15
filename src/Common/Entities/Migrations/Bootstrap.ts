import { ConsentRequestLog as CRL1 } from "./Implementations/1/ConsentRequestLog";
import { DataHolderRegistration as DHR1 } from "./Implementations/1/DataHolderRegistration";
import { JtiLog as JL1 } from "./Implementations/1/JtiLog";
import { createConnection } from "typeorm";
import _ from "lodash"
import moment from "moment"
import { doMigrations } from "./MigrationSequence";
import { ConsentRequestLog } from "../ConsentRequestLog";
import { DataHolderRegistration } from "../DataHolderRegistration";
import { JtiLog } from "../JtiLog";
import { typeormLogger } from "./Logger";
const rimraf = require("rimraf")

export const Version1Entities = [CRL1, DHR1, JL1];

export const Version1EntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: "adr_",
  synchronize: false,
  logger: typeormLogger,
  entities: Version1Entities
};

export const LatestEntityDefaults = {
  type: "sqlite",
  database: ":memory:",
  entityPrefix: "adr_",
  synchronize: false,
  logger: typeormLogger,
  entities: [ConsentRequestLog, DataHolderRegistration, JtiLog]
};

export const BootstrapTempDb = async () => {
  // delete previous temporary dbs
  rimraf.sync("tmp.*.sqlite")
  const tempFileName = "tmp."+moment().unix()+".sqlite"

  const initConnection = await createConnection(_.merge(<any>{},Version1EntityDefaults,{database:tempFileName}));
  await doMigrations(initConnection)
  await initConnection.close()
  const updatedConnection = await createConnection(_.merge(<any>{},LatestEntityDefaults,{database:tempFileName}));
  return updatedConnection;
}