import { agent, lead_status, Prisma, PrismaClient, user } from "@prisma/client";
import prisma from "..";

export default class BaseRepo<V> {
  protected repo: any;
  constructor() {
    this.repo = null;
  }

  findById<T extends string | string[] | number | number[] | boolean>(
    key: string,
    value: T,
    include?: Object,
    select = {}
  ): Promise<V[]> {
    if (Object.keys(select).length) {
      return this.repo.findMany(
        { where: { [`${key}`]: { in: value } } },
        select
      );
    }
    return this.repo.findMany({ where: { [`${key}`]: { in: value } } });
  }

  findOneById<T extends string | number>(
    key: string,
    value: T,
    include?: Object,
    select = {}
  ): Promise<V> {
    if (Object.keys(select).length) {
      return this.repo.findFirst(
        { where: { [`${key}`]: { in: value } } },
        select
      );
    }
    return this.repo.findFirst({ where: { [`${key}`]: { in: value } } });
  }
  update(data: any, key: string, value: any): Promise<V> {
    console.log(typeof value);

    return this.repo.update({ where: { [`${key}`]: value }, data });
  }

  create(data: any): Promise<V> {
    console.log("ok");
    return this.repo.create({ data });
  }
}
