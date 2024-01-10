import { BaseConsumer } from "../../services/consumers/base.consumer";

export interface IBaseQueue {
  queueName: string;
  exchange: string;
  routingKey: string;
}
export type IWorkerQueue = IBaseQueue & {
  opts?: Object;
  retry_queue: string;
  retry_exchange: string;
  delayConfig: {
    isDelayed: boolean;
    delayDurations: IDelayQueueConfig[];
  };
};

export type IStaticDeadQueue = IBaseQueue & { opts?: Object };

export type IDeadLetterQueue = IBaseQueue & {
  opts?: Object;
  retry_queue: string;
  retry_exchange: string;
};

export interface IDelayQueueConfig {
  delayTimeInMs: number;
  dead_letter_queue: string;
  dead_letter_exchange: string;
  dead_letter_routing_key: string;
}

export interface IQueue {
  retryCount: number;
  prefetch?: number;
  worker: IWorkerQueue;
  static_dead_queue?: IStaticDeadQueue;
  dead_letter_queue?: IDeadLetterQueue;
}

export interface IChannelExchange {
  prefetch_count: number;
  exchange_type: string;
  queues: IQueues;
}

export interface IQueues {
  [Key: string]: IQueue;
}

export type PublishContextKey = "agentAssignmentExchange";

export type IQueueConfig = Record<PublishContextKey, IChannelExchange>;

export type IConsumerConfig = Record<string, Record<string, BaseConsumer>>;
