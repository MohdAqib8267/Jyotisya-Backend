import { Request, response, Response } from "express";
import moment from "moment";
import { calendarService } from "../../services/services.factory";
import { BusinessHours } from "../../types";
import { sendErrorResponse } from "../../utils/http";

export const getBusinessHours = async (req: Request, res: Response) => {
  try {
    const agent_id = parseInt(req.params.agent_id) as number;
    const business_hours = await calendarService.getAgentBusinessHours(
      agent_id
    );

    res.json({
      success: true,
      message: "Agent Business Hours",
      data: {
        agent_id,
        business_hours,
      },
    });
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};

export const setBusinessHours = async (req: Request, res: Response) => {
  try {
    const agent_id = parseInt(req.params.agent_id) as number;
    const business_hours = req.body.business_hours as BusinessHours[];

    const updated_business_hours =
      await calendarService.updateAgentBusinessHours(agent_id, business_hours);

    res.json({
      success: true,
      message: "Business Hours Updated",
      data: {
        agent_id,
        business_hours: updated_business_hours,
      },
    });
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};

export const getAstroBookings = async (req: Request, res: Response) => {
  try {
    const agent_id = req.body.agent_id as number;
    const agent_booking = await calendarService.getAstroCalendar(agent_id);

    return res.json({
      success: true,
      message: "Agent Bookings",
      data: {
        agent_booking,
      },
    });
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};
