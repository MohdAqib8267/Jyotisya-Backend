import appConfig from "../config";
import {
  userRepo,
  agentRepo,
  leadStatusRepo,
  knowlarityRepo,
  userKundliRepo,
} from "../data/repositories/repository.factory";
import {
  BaseServiceParams,
  UserServiceParams,
  AgentServiceParams,
  calendarServiceParams,
  KnowlarityServiceParams,
  OrderServiceParams,
  WatiServiceParams,
} from "../types";
import Logger from "../utils/log";
import AgentService from "./agent.service";
import UserService from "./user.service";
import CalendarService from "./calendar.service";
import KnowlarityService from "./knowlarity.service";
import OrderService from "./order.service";
import {
  astrologyApiClient,
  jyotisyaLambdaApiClient,
  watiClient,
} from "../client";
import { WatiService } from "./wati.service";

const baseParams: Omit<BaseServiceParams, "logger"> = {
  userRepo,
  agentRepo,
  leadStatusRepo,
  knowlarityRepo,
  userKundliRepo,
  config: appConfig,
  astrologyApiClient,
  jyotisyaLambdaApiClient,
};

const userServiceParams: UserServiceParams = {
  logger: new Logger("USER_SERVICE"),
  ...baseParams,
};
const orderServiceParams: OrderServiceParams = {
  logger: new Logger("ORDER_SERVICE"),
  ...baseParams,
};
const agentServiceParams: AgentServiceParams = {
  logger: new Logger("AGENT_SERVICE"),
  ...baseParams,
};
const calendarServiceParams: calendarServiceParams = {
  logger: new Logger("CALENDAR_SERVICE"),
  ...baseParams,
};

const knowlarityServiceParams: KnowlarityServiceParams = {
  logger: new Logger("KNOWLARITY"),
  ...baseParams,
};

const watiServiceParams: WatiServiceParams = {
  logger: new Logger("WATI_SERVICE"),
  watiClient,
  ...baseParams,
};

export const userService = new UserService(userServiceParams);

export const orderService = new OrderService(orderServiceParams);

export const agentService = new AgentService(agentServiceParams);

export const calendarService = new CalendarService(calendarServiceParams);

export const knowlarityService = new KnowlarityService(knowlarityServiceParams);

export const watiService = new WatiService(watiServiceParams);
