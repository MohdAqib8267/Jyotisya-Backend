import prisma from "..";
import BaseRepo from "./base.db";
import { Prisma, user_kundli } from "@prisma/client";

export default class UserKundliRepository extends BaseRepo<user_kundli> {
  protected repo: Prisma.user_kundliDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    super();
    this.repo = prisma.user_kundli;
  }
}
