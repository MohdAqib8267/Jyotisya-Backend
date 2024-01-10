import { events_knowlarity, Prisma } from "@prisma/client";
import prisma from "..";
import { IKnowlarityRepository } from "../interfaces";
import BaseRepo from "./base.db";

export default class KnowlarityRepository
  extends BaseRepo<events_knowlarity>
  implements IKnowlarityRepository
{
  protected repo: Prisma.events_knowlarityDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    super();
    this.repo = prisma.events_knowlarity;
  }
}
