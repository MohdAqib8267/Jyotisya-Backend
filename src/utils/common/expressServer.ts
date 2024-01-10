import http from "http";
import express from "express";
import routes from "../../api";
import { applyMiddleware, createRoutes } from "../server";
import App from "./App";
import appConfig from "../../config";
import middlewares from "../../middlewares";
export default class ExpressServer extends App {
  readonly port: number;
  readonly app: express.Express;
  constructor(port: number) {
    super();
    this.app = express();
    this.port = port;
  }

  async start() {
    await super.start();
    const server = http.createServer(this.app);
    server.keepAliveTimeout = appConfig.keepAliveTimeout;
    server.headersTimeout = appConfig.headersTimeout;
    server.listen(this.port, () =>
      console.info(
        `Server listening at port :${this.port} and pid: ${process.pid}`
      )
    );
  }

  protected async init() {
    await super.init();
    await this.mountMiddleware();
    await this.addRoutes();
    await this.getRabbitMqConnection();
  }
  async getRabbitMqConnection() {
    return "";
  }
  addRoutes() {
    createRoutes(routes, this.app);
  }
  mountMiddleware() {
    for (const middleware of middlewares) {
      this.app.use(middleware);
    }
  }
}
