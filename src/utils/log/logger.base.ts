import moment from "moment";
import winston from "winston";
import "winston-daily-rotate-file";

const logFolder = process.env.LOG_FOLDER || "/var/log/a-logger";

const baseLogger = winston.createLogger({
  defaultMeta: { service: "backend-service" },
  transports: [
    new winston.transports.DailyRotateFile({
      filename: `${logFolder}/error-%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.splat()
      ),
      level: "error",
    }),
    new winston.transports.DailyRotateFile({
      filename: `${logFolder}/dev-%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.splat()
      ),
      // format: ecsFormat({ convertReqRes: true }),
      level: "info",
    }),
    new winston.transports.Console({
      level: "info",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.splat()
      ),
    }),
  ],
});

export default baseLogger;
