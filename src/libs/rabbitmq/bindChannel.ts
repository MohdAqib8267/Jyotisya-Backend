import { Channel } from "amqplib";
import Logger from "../../utils/log";
import { IChannelExchange } from "../../config/types/rabbitmq.types";
import { BaseConsumer } from "../../services/consumers/base.consumer";

export class BindChannel {
  private _channel: Channel;
  private _exchangeConfig: IChannelExchange;
  private _consumerConfig: Record<string, BaseConsumer>;
  private _logger: Logger;
  constructor(
    logger: Logger,
    channel: Channel,
    exchangeConfig: any,
    consumerConfig: any
  ) {
    this._logger = logger;
    this._channel = channel;
    this._exchangeConfig = exchangeConfig;
    this._consumerConfig = consumerConfig;
    this.#_createBindings();
  }

  async #_prepareExchange(
    channel: Channel,
    exchange: string,
    exchangeType: string
  ) {
    try {
      // if ('delayConfig' in workerQueue && workerQueue.delayConfig.isDelayed) {
      //   await channel.assertExchange(
      //     workerQueue.exchange,
      //     "x-delayed-message",
      //     {
      //       autoDelete: false,
      //       durable: true,
      //       arguments: { "x-delayed-type": exchangeType },
      //     }
      //   );
      // } else {
      await channel.assertExchange(exchange, exchangeType);
      // }
    } catch (err: any) {
      this._logger.error({
        stage: "PREPARE_CHANNEL",
        data: {
          exchangeName: exchange,
          exchangeType,
        },
        error: "Failed to assert",
        stack: err?.stack,
        message: err?.message,
      });
    }
  }

  async #_prepareQueue(
    channel: Channel,
    queueName: string,
    exchange: string,
    exchangeType: string,
    isDeadLetter?: boolean,
    opts?: Object,
    retry_queue?: string,
    retry_exchange?: string,
    ttl?: number
  ) {
    try {
      if (isDeadLetter) {
        await channel.assertQueue(queueName, {
          arguments: {
            "x-message-ttl": ttl,
            "x-dead-letter-exchange": retry_exchange,
            "x-dead-letter-routing-key": retry_queue,
            "x-expires": 7 * 24 * 60 * 60 * 1000,
          },
        });
      } else {
        await channel.assertQueue(queueName, opts);
      }
    } catch (err: any) {
      this._logger.error({
        stage: "PREPARE_QUEUES",
        data: {
          queue: queueName,
          exchangeName: exchange,
          exchangeType,
        },
        error: "Failed to assert",
        stack: err?.stack,
        message: err?.message,
      });
    }
  }

  async #_createBindingForQueue(queueKey: string) {
    try {
      const queueConfig = this._exchangeConfig.queues[queueKey];
      const workerQueue = queueConfig.worker;
      await this.#_prepareExchange(
        this._channel,
        workerQueue.exchange,
        this._exchangeConfig.exchange_type
      );
      await this.#_prepareQueue(
        this._channel,
        workerQueue.queueName,
        workerQueue.exchange,
        this._exchangeConfig.exchange_type
      );
      if (queueConfig.static_dead_queue) {
        await this.#_prepareExchange(
          this._channel,
          queueConfig.static_dead_queue.exchange,
          this._exchangeConfig.exchange_type
        );
        await this.#_prepareQueue(
          this._channel,
          queueConfig.static_dead_queue.queueName,
          queueConfig.static_dead_queue.exchange,
          this._exchangeConfig.exchange_type
        );
        await this._channel.bindQueue(
          queueConfig.static_dead_queue.queueName,
          queueConfig.static_dead_queue.exchange,
          queueConfig.static_dead_queue.routingKey
        );
      }
      await Promise.all([
        this._channel.bindQueue(
          workerQueue.queueName,
          workerQueue.exchange,
          workerQueue.routingKey
        ),
      ]);

      for (const delayConfig of queueConfig.worker.delayConfig.delayDurations) {
        await this.#_prepareExchange(
          this._channel,
          delayConfig.dead_letter_exchange,
          this._exchangeConfig.exchange_type
        );
        await this.#_prepareQueue(
          this._channel,
          delayConfig.dead_letter_queue,
          delayConfig.dead_letter_exchange,
          this._exchangeConfig.exchange_type,
          true,
          {},
          queueConfig.worker.retry_queue,
          queueConfig.worker.retry_exchange,
          delayConfig.delayTimeInMs
        );
        await this._channel.bindQueue(
          delayConfig.dead_letter_queue,
          delayConfig.dead_letter_exchange,
          delayConfig.dead_letter_routing_key
        );
      }

      await this._channel.consume(workerQueue.queueName, (msg) => {
        this._processMessage(msg, queueKey, workerQueue.queueName);
      });
    } catch (err) {}
  }

  async _processMessage(msg: any, queueKey: string, queueName: string) {
    let processResp: any;
    try {
      const worker: BaseConsumer = this._consumerConfig[queueKey];
      processResp = await this._consumerConfig[queueKey]._processMessage(
        msg.content.toString(),
        {
          worker,
          channel: this._channel,
          queueName,
        }
      );
    } catch (err: any) {
      console.log(err);

      this._logger.error({
        stage: "MESSAGE_PROCESSING",
        data: {
          msg: msg?.content.toString(),
        },
        error: "Failed to process message",
        stack: err?.stack,
        message: err?.message,
      });
    } finally {
      if (processResp === true) {
        this._channel.ack(msg);
      } else if (processResp === "requeue") {
        const queueConfig = this._exchangeConfig.queues[queueKey];
        this._channel.sendToQueue(
          queueConfig.worker.queueName,
          Buffer.from(msg),
          msg.properties
        );
        this._channel.ack(msg);
      } else {
        const queueConfig = this._exchangeConfig.queues[queueKey];
        if (queueConfig.retryCount) {
          let msgRetryCount = 0;
          if (msg.properties.headers && msg.properties.headers["x-death"]) {
            msgRetryCount = msg.properties.headers["x-death"].reduce(
              (acc: number, doc: any) => {
                return (acc += doc.count);
              },
              0
            );
          }
          if (
            queueConfig.retryCount !== -1 &&
            msgRetryCount > queueConfig.retryCount
          ) {
            if (queueConfig.static_dead_queue) {
              await this._channel.sendToQueue(
                queueConfig.static_dead_queue.queueName,
                Buffer.from(msg.content)
              );
              this._channel.ack(msg);
              return;
            }
          } else {
            const { delayConfig } = await this._consumerConfig[
              queueKey
            ]._getDelayConfig(msgRetryCount, queueConfig);
            if (queueConfig.worker.delayConfig.isDelayed === false) {
              this._channel.publish(
                queueConfig.static_dead_queue?.exchange || "",
                queueConfig.static_dead_queue?.queueName || "",
                msg.content
              );
              this._channel.ack(msg);
              return;
            }
            const { delayTimeInMs, dead_letter_exchange, dead_letter_queue } =
              delayConfig;
            if (delayTimeInMs) {
              const val = await this._channel.publish(
                "",
                dead_letter_queue,
                Buffer.from(msg.content),
                {
                  headers: {
                    "x-message-ttl": delayTimeInMs,
                    "x-death": msg?.properties?.headers["x-death"] || [],
                  },
                }
              );
              console.log(val);
            }
          }
        }
        this._channel.ack(msg);
      }
    }
  }

  async #_createBindings() {
    try {
      for (const queue in this._exchangeConfig.queues) {
        await this.#_createBindingForQueue(queue);
      }
    } catch (err) {}
  }
}
