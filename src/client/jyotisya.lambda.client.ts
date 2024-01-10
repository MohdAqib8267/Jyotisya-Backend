import { BaseClient } from "./base.client";
import { jyotisyaLambdaApiConfig } from "./config/jyotisya.lambda.client";
import { AxiosHeaders, AxiosRequestConfig, AxiosResponse } from "axios";

export default class JyotisyaLambdaClient extends BaseClient {
  requestInterceptor = async (request: AxiosRequestConfig) => {
    request.baseURL = jyotisyaLambdaApiConfig.base_url;
    (request.headers as AxiosHeaders).set(
      "Authorization",
      `Bearer ${jyotisyaLambdaApiConfig.token}`
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
  generateKundli = (data: any) => {
    return this.callApi({ url: `api/getHoroscope`, data, method: "POST" });
  };
}
