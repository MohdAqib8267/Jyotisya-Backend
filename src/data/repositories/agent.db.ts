import prisma from "..";
import BaseRepo from "./base.db";
import { agent, Prisma } from "@prisma/client";
import { IAgentRepository } from "../interfaces";

export default class AgentRepository
  extends BaseRepo<agent>
  implements IAgentRepository
{
  protected repo: Prisma.agentDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    super();
    this.repo = prisma.agent;
  }
}
