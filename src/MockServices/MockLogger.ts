import winston = require("winston");

const level = process.env.LOG_SILENT ? "silent" : (process.env.LOG_LEVEL || "warn");

const transports = [
    new winston.transports.Console({
        handleExceptions: true,
        level
    }),
];

export const logger = winston.createLogger({
  transports,
  exitOnError: false
});