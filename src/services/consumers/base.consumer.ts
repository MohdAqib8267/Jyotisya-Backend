import Logger from "../../utils/log";
import queues from "../../config/rabbitmq.config";
import {
  IDelayQueueConfig,
  IQueue,
  PublishContextKey,
} from "../../config/types/rabbitmq.types";

export abstract class BaseConsumer {
  protected _logger: Logger;
  abstract _getDelayConfig(
    retryCount: number,
    queueConfig: IQueue
  ): Promise<{ delayConfig: IDelayQueueConfig }>;
  abstract _processMessage(msg: string, props?: Object): Promise<boolean>;
  constructor(logger: Logger) {
    this._logger = logger;
  }

  _getDelayTime(msgRetryCount: number, queueConfig: IQueue): IDelayQueueConfig {
    const delayConfig = queueConfig.worker.delayConfig;
    if (msgRetryCount === 0) {
      return queueConfig.worker.delayConfig.delayDurations[0];
    }
    if (msgRetryCount < queueConfig.retryCount) {
      return delayConfig.delayDurations[
        Math.min(msgRetryCount, delayConfig.delayDurations.length) - 1
      ];
    } else {
      return delayConfig.delayDurations[delayConfig.delayDurations.length - 1];
    }
  }

  getRetryQueue(queueConfig: IQueue) {
    // const retry_queue_name = queueConfig.retry_queue;
    // const retry_exchange_name = queueConfig.retry_exchange;
    // for(const publishKey in queues) {
    //   const _queues = queues[publishKey as PublishContextKey].queues;
    //   for(const queue in _queues) {
    //     if(_queues[queue].worker.queueName === retry_queue_name && _queues[queue].worker.exchange === retry_exchange_name) {
    //       return _queues[queue];
    //     }
    //   }
    // }
  }
}
