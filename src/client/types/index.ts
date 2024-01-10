import { AxiosInstance } from "axios";
import { type } from "os";
import Logger from "../../utils/log";

export type AstroClientConfig = {
  token: string;
  base_url: string;
};

export type JyotisyaLambdaClientConfig = {
  token: string;
  base_url: string;
};
export type BaseClientConfig = {
  logger: Logger;
  name: string;
  instance?: AxiosInstance;
  timeout?: number;
};

export type AstrlogyClientConfig = BaseClientConfig & {};

export type BaseCallApiParams = {
  stage?: string;
};

export type WatiClientConfigTypes = {
  BASE_URL: string;
  TOKEN: string;
};

export type WatiSessionSendFileParamType = {
  caption: string;
  whatsappNumber: string;
};

export type WatiSessionSendFileBodyType = {
  file: string;
};

export type WatiSessionSendMessageType = {
  messageText: string;
  whatsappNumber: string;
};

export type WatiTemplateSendMessageType = {
  whatsappNumber: string;
};

export type WatiGetContactType = {
  pageSize?: number;
  pageNumber?: number;
  name?: string;
  attribute?: string;
  createdDate?: Date;
};
