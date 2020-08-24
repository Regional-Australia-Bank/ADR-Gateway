
export const logger = process.env.LOG_SILENT ? {
  debug: (...x) => {},
  error: (...x) => {},
  log: (...x) => {},
  info: (...x) => {},
  warn: (...x) => {},
} : console