import moment from "moment";
import prisma from "../data/index";
import { BusinessHours, calendarServiceParams } from "../types";
import { BaseService } from "./base.service";

import { _buildError, _logError } from "../utils/error";
import { AxiosError } from "axios";
import { AGENT_ROLE } from "@prisma/client";

export default class CalendarService extends BaseService {
  constructor(params: calendarServiceParams) {
    super(params);
  }

  getAgentBusinessHours = async (agent_id: number) => {
    return await prisma.agent_business_hours.findMany({
      where: {
        agent_id,
        is_active: true,
      },
    });
  };

  updateAgentBusinessHours = async (
    agent_id: number,
    businessHours: BusinessHours[]
  ) => {
    // await this.validateData(calendar);
    await prisma.agent_business_hours.updateMany({
      where: {
        agent_id,
      },
      data: {
        is_active: false,
      },
    });

    return await prisma.agent_business_hours.createMany({
      data: businessHours.map((item) => {
        return {
          agent_id,
          day_no: item.day_no,
          slot_start_time: item.start_time,
          slot_end_time: item.end_time,
          is_active: true,
        };
      }),
    });
  };

  getAstroCalendar = async (agent_id: number) => {
    return await prisma.agent_booking.findMany({
      where: {
        astro_id: agent_id,
        show_on_astro_calendar: true,
      },
    });
  };

  getRMCalendar = async (agent_id: number) => {
    return await prisma.agent_booking.findMany({
      where: {
        rm_id: agent_id,
        show_on_rm_calendar: true,
      },
    });
  };
}
