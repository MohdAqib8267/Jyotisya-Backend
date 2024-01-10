import Logger from "../utils/log";
import { BaseConsumer } from "../services/consumers/base.consumer";
import { LeadAssignmentConsumer } from "../services/consumers/leadAssign.consumer";
import { LeadAssignmentDeadConsumer } from "../services/consumers/leadAssignmentStaticDead.consumer";

export const consumerConfig: Record<string, Record<string, BaseConsumer>> = {
  agentAssignmentExchange: {
    leadAssign: new LeadAssignmentConsumer(new Logger("LEAD_ASSIGN")),
    leadAssignRetry: new LeadAssignmentConsumer(new Logger("LEAD_ASSIGN")),
    leadAssignmentDead: new LeadAssignmentDeadConsumer(
      new Logger("LEAD_ASSIGN")
    ),
    leadReattemptRetry: new LeadAssignmentConsumer(new Logger("REASSIGNMENT")),
  },
};
