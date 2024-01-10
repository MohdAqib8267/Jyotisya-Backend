import FormData from "form-data";
import { BaseClient } from "./base.client";
import { watiConfig } from "./config/wati.client.config";
import { AxiosHeaders, AxiosRequestConfig, AxiosResponse } from "axios";
import {
  WatiGetContactType,
  WatiSessionSendFileBodyType,
  WatiSessionSendFileParamType,
  WatiSessionSendMessageType,
} from "./types";
import { ALLOWED_PHONE_NUMBER } from "../constants";
export class WatiClient extends BaseClient {
  async requestInterceptor(
    request: AxiosRequestConfig<any>
  ): Promise<AxiosRequestConfig<any>> {
    request.baseURL = watiConfig.BASE_URL;
    (request.headers as AxiosHeaders).set(
      "Authorization",
      `Bearer ${watiConfig.TOKEN}`
    );
    if (
      request.method !== "GET" &&
      typeof request.headers?.getContentType === "function" &&
      !request.headers?.getContentType()
    ) {
      (request.headers as AxiosHeaders).set("Content-Type", "application/json");
    } else if (request.data instanceof FormData) {
      for (const [headerName, headValue] of Object.entries(
        request.data.getHeaders()
      )) {
        (request.headers as AxiosHeaders).set(headerName, headValue);
      }
    }
    return request;
  }
  async responseInterceptor(
    response: AxiosResponse<any, any>
  ): Promise<AxiosResponse<any, any>> {
    return response;
  }
  async responseInterceptorOnError(
    response: AxiosResponse<any, any>
  ): Promise<AxiosResponse<any, any>> {
    return response;
  }

  sendTemplateMessage = (data: object, whatsappNumber: string) => {
    return this.callApi({
      url: `api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`,
      data,
      method: "POST",
    });
  };

  sendSessionMessage = (
    params: WatiSessionSendMessageType,
    whatsappNumber: string
  ) => {
    return this.callApi({
      url: `api/v1/sendSessionMessage/${whatsappNumber}`,
      params,
      method: "POST",
    });
  };

  sendSessionFile = (
    params: WatiSessionSendFileParamType,
    data: FormData,
    whatsappNumber: string
  ) => {
    return this.callApi({
      url: `api/v1/sendSessionFile/${whatsappNumber}`,
      params,
      headers: {
        "Content-Type": "multipart/form-data",
      },
      data,
      method: "POST",
    });
  };

  getContact = (params: WatiGetContactType) => {
    return this.callApi({ url: `api/v1/getContacts`, params });
  };
}
