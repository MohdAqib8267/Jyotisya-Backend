import baseLogger from "./logger.base";
const logger = (
  key: string,
  message: string,
  stage: string,
  type: "info" | "error"
) => {
  if (type === "info") {
    baseLogger.info(message, key, stage);
  } else if (type === "error") {
    baseLogger.error(message, key, stage);
  }
};

type LoggerTypes = {
  stage: any;
  data?: any;
};

type InfoType = LoggerTypes & {
  info: string;
};

type ErrorType = LoggerTypes & {
  error: string;
  stack?: any;
  message?: string;
};

class Logger {
  private _key: string;
  constructor(key: string) {
    this._key = key;
  }

  info = (params: InfoType) => {
    baseLogger.info({
      "@timestamp": new Date().toISOString(),
      key: this._key,
      info: params.info,
      data: params.data,
      stage: params.stage,
      app_name: process.env.APP,
    });
  };

  error = (params: ErrorType) => {
    baseLogger.error({
      "@timestamp": new Date().toISOString(),
      key: this._key,
      error: params.error,
      data: params.data,
      stage: params.stage,
      app_name: process.env.APP,
    });
  };
}

export default Logger;
