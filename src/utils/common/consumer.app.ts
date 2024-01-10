import { consumerConfig } from "../../config/consumers.config";
import queues from "../../config/rabbitmq.config";
import { RabbitmqConnection } from "../../libs/rabbitmq/connection";
import Logger from "../log";
import App from "./App";

export default class ConsumerRunner extends App {
  constructor() {
    super();
  }
  protected async init(): Promise<void> {
    await super.init();
    RabbitmqConnection.getInstance(
      new Logger("RABBITMQ_INIT"),
      queues,
      consumerConfig
    );
  }

  public async start(): Promise<void> {
    super.start();
  }
}
