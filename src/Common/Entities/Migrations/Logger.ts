import winston = require("winston");
import * as Transport from 'winston-transport';
import { combineReplacers, errorReplacer, configReplacer, axiosReplacer } from "../../../Common/LogReplacers";
import { QueryRunner } from "typeorm";

const level = process.env.LOG_LEVEL || "info";

const transports: Transport[] = [
  new winston.transports.Console({
    handleExceptions: true,
    level
  }),
];
if (process.env.LOG_FILE) {
  transports.push(new winston.transports.File({ filename: process.env.LOG_FILE, level }))
}

export const logger = winston.createLogger({
  transports,
  exitOnError: false,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json({
      replacer: combineReplacers(errorReplacer, configReplacer, axiosReplacer)
    })
  )
});

export const typeormLogger =  {
  logQuery: (query: string, parameters?: any[], queryRunner?: QueryRunner) => {
    logger.info({query,parameters})
  },
  logQueryError: (error: string, query: string, parameters?: any[], queryRunner?: QueryRunner) => {
    // We don't want to log errors at this level, because it can be confusing.
    // logger.error(error,{query,parameters})
  },
  logQuerySlow:(time: number, query: string, parameters?: any[], queryRunner?: QueryRunner) => {
    logger.info("slow query",{query,parameters,time})
  },
  logSchemaBuild:(message: string, queryRunner?: QueryRunner) => {
    logger.info(message)
  },
  logMigration:(message: string, queryRunner?: QueryRunner) => {
    logger.info(message)
  },
  log:(level: "log" | "info" | "warn", message: any, queryRunner?: QueryRunner) => {
    if (level == "warn") logger.warn(message);
    else logger.info(message);
  },
}