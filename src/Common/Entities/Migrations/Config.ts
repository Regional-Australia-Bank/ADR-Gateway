import convict = require("convict");
import { ConvictSchema } from "../../Server/Config";

export const configure = () => {
  const config = convict({
    Database: ConvictSchema.Database
  })

  config.load({Database: (process.env.ADR_DATABASE_OPTIONS && JSON.parse(process.env.ADR_DATABASE_OPTIONS)) || {} })
  config.validate({allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict'});
  return config.get();
}

export type MigrationDbConfig = ReturnType<typeof configure>