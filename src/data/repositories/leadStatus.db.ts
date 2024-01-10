import prisma from "..";
import BaseRepo from "./base.db";
import { NewLeadType } from "../../types";
import { IAgentRepository } from "../interfaces";
import { lead_status, Prisma } from "@prisma/client";

export default class LeadStatusRepository
  extends BaseRepo<lead_status>
  implements IAgentRepository
{
  protected repo: Prisma.lead_statusDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    super();
    this.repo = prisma.lead_status;
  }

  addNewLead(data: NewLeadType) {
    return this.create(data);
  }

  updateLead(lead_id: number, status: number, rating: number) {
    return this.update({ status_id: status, rating }, "lead_id", lead_id);
  }

  findBusyAgent(agent_ids: number[]) {
    return this.repo.findMany({
      where: {
        agent_id: { in: agent_ids },
        status_id: 0,
      },
      select: {
        agent_id: true,
      },
    });
  }

  fetchLead(agentId: number) {
    return this.repo.findMany({
      where: {
        agent_id: agentId,
        status_id: 0,
      },
    });
  }
}
