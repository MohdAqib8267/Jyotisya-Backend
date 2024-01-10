import appConfig from "../../config";
import Logger from "../../utils/log";
import { BindChannel } from "./bindChannel";
import { Connection, connect } from "amqplib";
import {
  IConsumerConfig,
  IQueueConfig,
} from "../../config/types/rabbitmq.types";

export class RabbitmqConnection {
  private static connection: Connection | null;
  private static instance: RabbitmqConnection;
  private _logger: Logger;
  private _queueConfig: IQueueConfig;
  private _consumerConfig: IConsumerConfig;
  constructor(
    logger: Logger,
    queueConfig: IQueueConfig,
    consumerConfig: IConsumerConfig
  ) {
    this._logger = logger;
    this._queueConfig = queueConfig;
    this._consumerConfig = consumerConfig;
    this.createConnection();
  }

  public static getInstance(
    logger: Logger,
    queueConfig: IQueueConfig,
    consumerConfig: any
  ) {
    if (!RabbitmqConnection.instance) {
      RabbitmqConnection.instance = new RabbitmqConnection(
        logger,
        queueConfig,
        consumerConfig
      );
    }
  }
  async createConnection() {
    try {
      RabbitmqConnection.connection = await connect(appConfig.RABBITMQ_URL);
      RabbitmqConnection.connection
        .on("error", async (err) => {
          this._logger.error({
            stage: "Connecting to rabbitmq",
            error: "Failed to connect",
            data: {
              url: appConfig.RABBITMQ_URL,
            },
          });
        })
        .on("close", async (err) => {
          this._logger.error({
            stage: "Connecting to rabbitmq",
            error: "connection closed",
            data: {
              url: appConfig.RABBITMQ_URL,
            },
          });
          setTimeout(() => {
            this.createConnection(), 5 * 1000;
          });
        });
      this._logger.info({
        stage: "Connecting to rabbitmq",
        info: "Connected to rabbitmq",
        data: {
          url: appConfig.RABBITMQ_URL,
        },
      });
      this._createChannels();
    } catch (err) {
      this._logger.error({
        stage: "Connecting to rabbitmq",
        error: "Error in connecting",
        data: {
          url: appConfig.RABBITMQ_URL,
        },
      });
      setTimeout(() => {
        this.createConnection(), 5 * 1000;
      });
    }
  }

  async _createChannel(exchangeKey: string) {
    const channelConfig = this._queueConfig[exchangeKey as keyof IQueueConfig];
    const { prefetch_count = 1, queues } = channelConfig;
    const channel = await RabbitmqConnection.connection?.createChannel()!;
    await channel?.prefetch(prefetch_count);
    channel
      .on("error", async (err) => {
        this._logger.error({
          stage: "CHANNEL_CREATION",
          error: "Failed to create channel",
          data: {
            exchangeKey,
          },
        });
        setTimeout(() => {
          this._createChannel(exchangeKey), 5 * 1000;
        });
      })
      .on("close", async (err) => {
        this._logger.error({
          stage: "CHANNEL_CREATION",
          error: "channel closed",
          data: {
            exchangeKey,
          },
        });
        setTimeout(() => {
          this._createChannel(exchangeKey), 5 * 1000;
        });
      });
    await new BindChannel(
      this._logger,
      channel,
      this._queueConfig[exchangeKey as keyof IQueueConfig],
      this._consumerConfig[exchangeKey as keyof IConsumerConfig]
    );
    this._logger.info({
      stage: "CHANNEL_CREATION",
      info: "channel created",
      data: {
        exchangeKey,
      },
    });
  }

  _createChannels = async () => {
    try {
      for (const exchangeKey in this._queueConfig) {
        await this._createChannel(exchangeKey);
      }
    } catch (err) {}
  };
}
