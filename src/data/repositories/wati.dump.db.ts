import { events_wati, Prisma } from "@prisma/client";
import prisma from "..";
import { IWatiDump } from "../interfaces";

export default class WatiDumpRepository implements IWatiDump {
  private repo: Prisma.events_watiDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    this.repo = prisma.events_wati;
  }

  async create(data: any): Promise<events_wati> {
    return this.repo.create({ data });
  }

  async update(id: number, data: any): Promise<events_wati> {
    return this.repo.update({ where: { id }, data });
  }
}
