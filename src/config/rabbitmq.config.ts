import { nanoid } from "nanoid";
import { IQueueConfig } from "./types/rabbitmq.types";

export const LEAD_EXCHANGE = "lead_exchange";
export const LEAD_DEAD_LETTER_EXCHANGE = "lead_dead_letter_exchange";
export const LEAD_STATIC_DEAD_EXCHANGE = "lead_static_dead_exchange";
export const LEAD_ASSIGNEMENT_QUEUE = "lead_assignment";
const id = nanoid(10);
const queues: IQueueConfig = {
  agentAssignmentExchange: {
    prefetch_count: 1,
    exchange_type: "direct",
    queues: {
      leadAssign: {
        retryCount: 1,
        prefetch: 1,
        worker: {
          queueName: LEAD_ASSIGNEMENT_QUEUE,
          exchange: LEAD_EXCHANGE,
          routingKey: LEAD_ASSIGNEMENT_QUEUE,
          retry_queue: "lead_assignment_retry",
          retry_exchange: LEAD_EXCHANGE,
          delayConfig: {
            isDelayed: true,
            delayDurations: [
              {
                delayTimeInMs: 1 * 60 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
            ],
          },
        },
        static_dead_queue: {
          queueName: "lead_assignment_static_dead_queue",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_assignment_static_dead_queue",
        },
        // dead_letter_queue: {
        //   queueName: "lead_assignment_dead_letter_queue",
        //   exchange: LEAD_DEAD_LETTER_EXCHANGE,
        //   routingKey: "lead_assignment_dead_letter_queue",
        //   retry_queue: "lead_assignment_retry",
        //   retry_exchange: LEAD_EXCHANGE,
        // },
      },
      leadAssignRetry: {
        retryCount: 30,
        prefetch: 1,
        worker: {
          queueName: "lead_assignment_retry",
          exchange: LEAD_EXCHANGE,
          routingKey: "lead_assignment_retry",
          retry_queue: "lead_assignment_retry",
          retry_exchange: LEAD_EXCHANGE,
          delayConfig: {
            isDelayed: true,
            delayDurations: [
              {
                delayTimeInMs: 1 * 60 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
            ],
          },
        },
        static_dead_queue: {
          queueName: "lead_assignment_static_dead_queue",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_assignment_static_dead_queue",
        },
        dead_letter_queue: {
          queueName: "lead_assignment_dead_letter_queue",
          exchange: LEAD_DEAD_LETTER_EXCHANGE,
          routingKey: "lead_assignment_dead_letter_queue",
          retry_queue: "lead_assignment_retry",
          retry_exchange: LEAD_EXCHANGE,
        },
      },
      leadReattempt: {
        retryCount: 3,
        prefetch: 1,
        worker: {
          queueName: "lead_reattempt",
          exchange: LEAD_EXCHANGE,
          routingKey: "lead_reattempt",
          retry_queue: "lead_reattempt_retry",
          retry_exchange: LEAD_EXCHANGE,
          delayConfig: {
            isDelayed: true,
            delayDurations: [
              {
                delayTimeInMs: 10 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
              {
                delayTimeInMs: 15 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
              {
                delayTimeInMs: 25 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
            ],
          },
        },
        static_dead_queue: {
          queueName: "lead_reattempt_static_dead_queue",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_reattempt_static_dead_queue",
        },
        dead_letter_queue: {
          queueName: "lead_reattempt_dead_letter_queue",
          exchange: LEAD_DEAD_LETTER_EXCHANGE,
          routingKey: "lead_reattempt_dead_letter_queue",
          retry_exchange: LEAD_EXCHANGE,
          retry_queue: "lead_reattempt",
        },
      },
      leadReattemptRetry: {
        retryCount: 3,
        prefetch: 1,
        worker: {
          queueName: "lead_reattempt",
          exchange: LEAD_EXCHANGE,
          routingKey: "lead_reattempt",
          retry_queue: "lead_reattempt_retry",
          retry_exchange: LEAD_EXCHANGE,
          delayConfig: {
            isDelayed: true,
            delayDurations: [
              {
                delayTimeInMs: 5 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
              {
                delayTimeInMs: 15 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
              {
                delayTimeInMs: 25 * 1000,
                dead_letter_exchange: LEAD_DEAD_LETTER_EXCHANGE,
                dead_letter_queue: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
                dead_letter_routing_key: `lead_assignment_dead_letter_queue-${nanoid(
                  10
                )}`,
              },
            ],
          },
        },
        static_dead_queue: {
          queueName: "lead_reattempt_static_dead_queue",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_reattempt_static_dead_queue",
        },
        dead_letter_queue: {
          queueName: "lead_reattempt_dead_letter_queue",
          exchange: LEAD_DEAD_LETTER_EXCHANGE,
          routingKey: "lead_reattempt_dead_letter_queue",
          retry_exchange: LEAD_EXCHANGE,
          retry_queue: "lead_reattempt",
        },
      },
      leadAssignmentDead: {
        retryCount: 1,
        prefetch: 1,
        worker: {
          queueName: "lead_assignment_static_dead_queue",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_reattempt",
          retry_queue: "lead_reattempt_retry",
          retry_exchange: LEAD_EXCHANGE,
          delayConfig: {
            isDelayed: false,
            delayDurations: [],
          },
        },
        static_dead_queue: {
          queueName: "lead_assignment_static_dead_queue_final",
          exchange: LEAD_STATIC_DEAD_EXCHANGE,
          routingKey: "lead_assignment_static_dead_queue_final",
        },
      },
    },
  },
};

export default queues;
