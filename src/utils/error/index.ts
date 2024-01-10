import Logger from "../log";

export const _logError = (
  logger: Logger,
  stage: string,
  error: Error | string,
  data: any
) => {
  logger.error({
    error: error instanceof Error ? error?.message : error,
    stage,
    data,
  });
};

export const _buildError = (
  logger: Logger,
  stage: string,
  error: Error | string,
  data: any
) => {
  if (typeof error === "string") {
    error = new Error(error);
  }
  _logError(logger, stage, error, data);
  return error;
};
