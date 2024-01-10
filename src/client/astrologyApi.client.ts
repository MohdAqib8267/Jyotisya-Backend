import { BaseClient } from "./base.client";
import { astrlogyApiConfig } from "./config/astrologyApi.client";
import {
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

export default class AstrologyAPIClient extends BaseClient {
  requestInterceptor = async (request: AxiosRequestConfig) => {
    request.baseURL = astrlogyApiConfig.base_url;
    (request.headers as AxiosHeaders).set(
      "Authorization",
      `Bearer ${astrlogyApiConfig.token}`
    );
    (request.headers as AxiosHeaders).set("Content-Type", "application/json");
    return request;
  };

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

  getChartSvg = (data: any, chart_type: string) => {
    return this.apiCaller({
      url: `/horo_chart_image/${chart_type}/`,
      data,
      method: "POST",
    });
  };
}
