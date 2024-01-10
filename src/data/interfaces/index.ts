import { user, Prisma, events_wati } from "@prisma/client";

export interface IUserRepository {
  create: (
    data: Prisma.SelectSubset<user, Prisma.userCreateArgs>
  ) => Promise<user>;
  findById: <T extends string | Array<string>>(
    key: string,
    value: T,
    include: Object
  ) => Promise<Array<user>>;
  update: (data: user, key: string, value: any) => Promise<user>;
}

export interface IAgentRepository {}

export interface ICustomerMapping {}

export interface ISessionData {}

export interface IcalendarRepository {}

export interface IAstroBookingsRepository {}

export interface IKnowlarityRepository {}

export interface IBookingData {}

export interface IWatiDump {
  create: (
    data: Prisma.SelectSubset<events_wati, Prisma.events_watiCreateArgs>
  ) => Promise<events_wati>;
}

export interface IWatiRecordRepository {
  create: (
    data: Prisma.SelectSubset<user, Prisma.userCreateArgs>
  ) => Promise<user>;
  findById: <T extends string | Array<string>>(
    key: string,
    value: T,
    include: Object
  ) => Promise<Array<user>>;
  update: (data: user, value: any) => Promise<user>;
}
