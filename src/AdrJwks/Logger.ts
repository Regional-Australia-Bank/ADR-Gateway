import winston = require("winston");

const transports = [
  new winston.transports.Console({
      handleExceptions: true,
      level: process.env.LOG_LEVEL || "warn"
  }),
];

export const logger = winston.createLogger({
  transports,
  exitOnError: false,
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
  )
});