import axios, {
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";
import { _buildError } from "../utils/error";
import Logger from "../utils/log";
import { BaseCallApiParams, BaseClientConfig } from "./types";

export abstract class BaseClient {
  protected logger: Logger;
  protected name: string;
  protected instance: AxiosInstance | null = null;
  protected timeout: number | undefined;
  constructor(params: BaseClientConfig) {
    this.name = params.name;
    this.timeout = params.timeout;
    this.logger = params.logger;
  }

  start = () => {
    this.instance = axios.create({
      timeout: this.timeout || 3000,
    });
    this.mountInterceptors();
    return this.instance;
  };
  mountInterceptors() {
    this.instance?.interceptors.request.use(this.requestInterceptor);
    this.instance?.interceptors.response.use(
      this.responseInterceptor,
      this.responseInterceptorOnError
    );
  }
  abstract requestInterceptor(
    request: AxiosRequestConfig
  ): Promise<AxiosRequestConfig>;
  abstract responseInterceptor(response: AxiosResponse): Promise<AxiosResponse>;
  abstract responseInterceptorOnError(
    response: AxiosResponse
  ): Promise<AxiosResponse>;

  apiCaller = async (
    requestConfig: AxiosRequestConfig | Promise<AxiosRequestConfig>
  ) => {
    const config = await requestConfig;
    try {
      const response = await (this.instance || axios)(config);
      if (response.status / 100 === 2) {
        return response.data;
      }
      throw _buildError(this.logger, "CALLING_API", response.statusText, {});
    } catch (err) {
      throw err;
    }
  };
  callApi = async (
    requestConfig: AxiosRequestConfig | Promise<AxiosRequestConfig>,
    params?: BaseCallApiParams
  ): Promise<any> => {
    if (!this.instance) {
      this.instance = this.start();
    }
    return this.callApiHelper(requestConfig);
  };

  callApiHelper = async (
    requestConfig: AxiosRequestConfig | Promise<AxiosRequestConfig>,
    params?: BaseCallApiParams
  ) => {
    const config = await requestConfig;
    const response = await (this.instance || axios)(config);
    if (response?.status && Math.floor(response.status / 100) === 2) {
      return response.data;
    }
    throw new Error(
      `API Error from client ${this.name} stage:${params?.stage} baseurl: ${
        config?.baseURL || this.instance?.defaults?.baseURL
      }/${config.url} status: ${response?.status} body: ${response?.data}`
    );
  };

  RecordMapper<T, U>(input: T, mapper: Record<string, string>): U {
    return this.RecordMapperHelper(input, mapper) as U;
  }
  RecordMapperHelper(input: any, mapper: Record<string, string>): any {
    if (!input || typeof input != "object") return input;
    if (Array.isArray(input))
      return input.map((v) => this.RecordMapperHelper(v, mapper));
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [
        mapper[k] || k,
        this.RecordMapperHelper(v, mapper),
      ])
    );
  }
}
