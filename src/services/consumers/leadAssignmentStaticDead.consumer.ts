import Logger from "../../utils/log";
import { BaseConsumer } from "./base.consumer";
import { IDelayQueueConfig, IQueue } from "../../config/types/rabbitmq.types";
import { userService } from "../services.factory";

export class LeadAssignmentDeadConsumer extends BaseConsumer {
  constructor(logger: Logger) {
    super(logger);
  }
  async _getDelayConfig(
    retryCount: number,
    queueConfig: IQueue
  ): Promise<{ delayConfig: IDelayQueueConfig }> {
    // const retryQueue = this.getRetryQueue(queueConfig);
    const delayConfig = this._getDelayTime(retryCount, queueConfig);
    return {
      delayConfig,
    };
  }
  async _processMessage(
    msg: string,
    props?: Object | undefined
  ): Promise<boolean> {
    const message = JSON.parse(msg);
    const resp = await userService.forwardRequestFromQueueWithStaticDead(
      message,
      "dead"
    );
    return !!resp;
  }
}
