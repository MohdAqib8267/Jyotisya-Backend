import prisma from "../index";
import BaseRepo from "./base.db";
import { Prisma, user } from "@prisma/client";

export default class UserRepository extends BaseRepo<user> {
  repo: Prisma.userDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation
  >;
  constructor() {
    super();
    this.repo = prisma.user;
  }
}
