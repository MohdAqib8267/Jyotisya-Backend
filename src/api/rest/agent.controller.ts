import { Request, Response } from "express";
import moment from "moment";
import {
  agentService,
  orderService,
  userService,
} from "../../services/services.factory";
import {
  agent_booking,
  AGENT_ROLE,
  EXTENSION_STATUS,
  phone_call,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import Auth from "../../middlewares/auth.jwt";
import { AddAgentPayload, BirthDetails, JyotisyaJWTPayload } from "../../types";
import { sendErrorResponse } from "../../utils/http";
import { _logError } from "../../utils/error";

const prisma = new PrismaClient();

const auth = new Auth();

export const extractAuthenticatedAgent = (req: Request) => {
  if (req.user) {
    return req.user as JyotisyaJWTPayload;
  }

  return null;
};


export const addNewAgent = async (req: Request, res: Response) => {
  try {
    const agent = req.body.agent as AddAgentPayload;
    
    const newAgent = await agentService.addNewAgent(
      agent.agent_name,
      agent.phone_number,
      null,
      agent.agent_role,
      agent.agency_id,
      agent.agent_earning_config_list
    );
      
    if (!newAgent) {
      return sendErrorResponse(res, 500, "Unable to save agent");
    }

    let credSaved = false;

    if (newAgent && newAgent.phone_number) {
      credSaved = await agentService.saveCredential(
        newAgent.agent_id,
        agent.password
      );
    }

    if (!credSaved) {
      return sendErrorResponse(res, 500, "Unable to save credentials");
    }

    return res.json({
      success: true,
      message: "Agent saved",
      data: {
        agent: {
          agent_id: newAgent.agent_id,
        },
      },
    });
  } catch (err: any) {
    console.log(err);
    return sendErrorResponse(res);
  }
};

export const hashPassword = async (req: Request, res: Response) => {
  const hash = await agentService.hashPassword(req.params.password as string);
  res.json(hash);
};

export const authorizeAgent = async (req: Request, res: Response) => {
  const data = req.body;
  console.log(req.body); 
  try {
    const agent_id = await agentService.validateCredential(
      data.username,
      data.password
    );

    if (typeof agent_id === "number") {
      const agent = await agentService.getAgentById(agent_id);

      if (agent) {
        const payload = {
          agent_id: agent.agent_id,
          name: agent.agent_name,
          role: agent.role,
          phone_number: agent.phone_number,
          agency_name: agent?.agency_info.agency_name,
        };

        const token = auth.createToken(payload);
        return res.json({
          success: true,
          message: "Login successful",
          data: {
            jwt: token,
            agent_info: payload,
          },
        });
      }
    }

    return sendErrorResponse(res, 403, "Invalid Credentials");
  } catch (e) {
    console.error(e);
    return sendErrorResponse(res);
  }
};

export const getLiveAgentLead = async (req: Request, res: Response) => {
  const self = extractAuthenticatedAgent(req);

  if (!self) {
    return sendErrorResponse(res, 401, "Unauthorized");
  }

  try {
    let assigned_booking: agent_booking | null = null;

    const ongoing_booking = await agentService.getOngoingCallBooking(
      self.agent_id
    );

    if (ongoing_booking) {
      assigned_booking = ongoing_booking;
    }

    if (!assigned_booking) {
      const pending_feedback_booking =
        await agentService.getPendingFeedbackBooking(self.agent_id);

      if (pending_feedback_booking) {
        assigned_booking = pending_feedback_booking;
      }
    }

    if (!assigned_booking) {
      return res.json({
        success: false,
        message: "No Leads in Queue",
        data: {
          retry_after: 5,
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        user_id: assigned_booking.user_id,
      },
    });

    if (!user) {
      return sendErrorResponse(res, 200, "User not found");
    }

    const last_phone_call = await orderService.getLastCallForBooking(
      assigned_booking.booking_id
    );

    if (!last_phone_call) {
      return sendErrorResponse(res, 200, "Phone Call not found");
    }

    const birth_details = user.birth_details as BirthDetails | null;

    let elapsed_duration = 0;

    const max_duration = last_phone_call.call_duration_ideal;
    const user_answered_at = last_phone_call.user_answered_at;

    if (user_answered_at) {
      elapsed_duration = Math.floor(
        (Date.now() - user_answered_at.getTime()) / 1000
      );

      if (last_phone_call.hangup_at) {
        elapsed_duration = Math.floor(
          (last_phone_call.hangup_at.getTime() - user_answered_at.getTime()) /
            1000
        );
      }
    }

    const remaining_duration = Math.max(0, max_duration - elapsed_duration);

    const phone_call_extensions = await orderService.getLiveCallExtensions(
      last_phone_call.call_id
    );
    const call_extensions_limited_info: Array<{
      uuid: string;
      status: EXTENSION_STATUS;
      duration: number;
    }> = [];

    for (const extension of phone_call_extensions) {
      const extension_sku_details = await orderService.getSkuDetails(
        extension.extension_sku_id
      );

      if (extension_sku_details) {
        // if(extension.extension_status === EXTENSION_STATUS.COMPLETED && extension.child_booking_id) {
        //   await agentService.setAgentEarningHistory(self.agent_id, extension.child_booking_id);
        // }
        call_extensions_limited_info.push({
          uuid: extension.extension_uuid,
          duration: extension_sku_details?.sku_duration_mins || 0,
          status: extension.extension_status,
        });
      }
    }

    return res.json({
      success: true,
      message: "Pending Lead",
      data: {
        lead: {
          is_new_customer: assigned_booking.is_new_user,
          booking_uuid: assigned_booking.booking_uuid,
          user_uuid: user.user_uuid,
          user_name: birth_details?.agent_input?.user_name || user.user_name,
          birth_details: birth_details,
        },
        interested_in: [{ id: 0, text: "5 min Call" }],
        note: {
          sku_id: 0,
          text: "Upsell Next Session",
        },
        call: {
          is_ongoing: last_phone_call.is_ongoing,
          is_picked: Boolean(last_phone_call.user_answered_at),
          remaining_duration: remaining_duration,
          max_duration: max_duration,
          extensions: call_extensions_limited_info,
        },
      },
    });
  } catch (err: any) {
    console.error(err);
  }

  return sendErrorResponse(res);
};

export const getAgentLeads = async (req: Request, res: Response) => {
  const leadType = (req.query.type as string) || "live";

  switch (leadType) {
    case "live":
      getLiveAgentLead(req, res);
      break;
    case "pending_feedback":
      getPendingFeedbackLeads(req, res);
      break;
    case "pending_payment":
      getPendingPaymentLeads(req, res);
      break;
    default:
      sendErrorResponse(res, 400, "Invalid Lead Type");
  }
};

export const updateLeadForAstro = async (req: Request, res: Response) => {
  const data = req.body;
  const resp = await agentService.updateLeadForAgent(data, "astro");
  return res.status(resp?.status || 400).json(resp?.message);
};

export const updateLeadForRM = async (req: Request, res: Response) => {
  const data = req.body;
  const resp = await agentService.updateLeadForAgent(data, "rm");
  return res.status(resp?.status || 400).json(resp?.message);
};

export const getAuthenticatedAgentDetails = async (
  req: Request,
  res: Response
) => {
  const self = extractAuthenticatedAgent(req);

  if (self) {
    try {
      const agent = await agentService.getAgentById(self.agent_id);

      return res.json({
        success: true,
        message: "Agent Details",
        data: {
          agent,
        },
      });
    } catch (err: any) {
      console.error(err);
      return sendErrorResponse(res);
    }
  }

  return sendErrorResponse(res);
};

export const setAgentOnlineStatus = async (req: Request, res: Response) => {
  const self = extractAuthenticatedAgent(req);
  const is_online = req.body.is_online as boolean;

  if (self) {
    try {
      const updatedAgent = await agentService.updateOnlineStatus(
        self.agent_id,
        is_online
      );

      return res.json({
        success: true,
        message: "Status Updated",
        data: {
          is_online: updatedAgent.is_online,
        },
      });
    } catch (err: any) {
      console.error(err);
    }
  }

  return sendErrorResponse(res);
};

export const getAllRM = async (req: Request, res: Response) => {
  try {
    const data = await agentService.getAllAgentsByRole(AGENT_ROLE.RM);
    console.log(data);
    return res.json({
      success: true,
      message: "RM List",
      data: {
        agent_list: data,
      },
    });
   
  } catch (err: any) {
    console.log(err);
    return sendErrorResponse(res);
  }
};

export const getAllAstrologers = async (req: Request, res: Response) => {
  try {
    const data = await agentService.getAllAgentsByRole(AGENT_ROLE.ASTRO);
    return res.json({
      success: true,
      message: "Astrologers List",
      data: {
        agent_list: data,
      },
    });
  } catch (err: any) {
    console.log(err);
    return sendErrorResponse(res);
  }
};


export const getAgentOnlineStatus = async (req: Request, res: Response) => {
  let is_online = false;

  try {
    const self = extractAuthenticatedAgent(req);

    if (self) {
      const agentStatus = await agentService.getOnlineStatus(self.agent_id);

      if (agentStatus) {
        is_online = agentStatus.is_online;
      }
    }
  } catch (e) {
    console.error(e);
    return sendErrorResponse(res);
  }

  return res.status(200).json({
    success: true,
    message: "Agent Status",
    data: {
      is_online: is_online,
    },
  });
};

export const getPendingFeedbackLeads = async (req: Request, res: Response) => {
  try {
    const self = extractAuthenticatedAgent(req);

    if (!self) {
      return sendErrorResponse(res, 401, "Unauthorized");
    }

    const pending_feedback_leads = await agentService.getPendingFeedbackLeads(
      self.agent_id
    );

    return res.json({
      success: true,
      message: "Pending Feedback Leads",
      data: {
        pending_feedback_leads,
      },
    });
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};

export const getPendingPaymentLeads = async (req: Request, res: Response) => {
  try {
    const self = extractAuthenticatedAgent(req);

    if (!self) {
      return sendErrorResponse(res, 401, "Unauthorized");
    }

    const potential_leads = await agentService.getPendingPaymentLeads(
      self.agent_id
    );

    const pending_session_leads = await agentService.getPendingSessionLeads(
      self.agent_id
    );

    return res.json({
      success: true,
      message: "Potential Leads",
      data: {
        pending_session_leads,
        potential_leads,
      },
    });
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};

export const getCallLogs = async (req: Request, res: Response) => {
  try {
    const self = extractAuthenticatedAgent(req);

    if (self) {
      const last_call_id =
        parseInt(req.query.pagination_token as unknown as string) || 0;
      const call_logs_data = await agentService.getCallLogs(
        self.agent_id,
        last_call_id
      );

      return res.json({
        success: true,
        message: "Call Logs",
        data: call_logs_data,
      });
    } else {
      return sendErrorResponse(res, 401, "Unauthorized");
    }
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};

export const getAgentAnalytics = async (req: Request, res: Response) => {
  try {
    const self = extractAuthenticatedAgent(req);

    const from_date = req.query.from_date as string;
    const to_date = req.query.to_date as string;
    const utc_offset_mins: number =
      parseInt(req.query.utc_offset_mins as unknown as string) || 0;

    const date_format = "YYYY-MM-DD";

    if (
      !moment(from_date, date_format, true).isValid() ||
      !moment(to_date, date_format, true).isValid()
    ) {
      return sendErrorResponse(res, 400, "Invalid Date Format");
    }

    if (moment(from_date) > moment(to_date)) {
      return sendErrorResponse(res, 400, "Invalid Date Range");
    }

    if (self) {
      const agent_analytics = await agentService.getAgentAnalytics(
        self.agent_id,
        from_date,
        to_date,
        utc_offset_mins
      );

      return res.json({
        success: true,
        message: "Agent Analytics",
        data: {
          agent_analytics,
        },
      });
    } else {
      return sendErrorResponse(res, 401, "Unauthorized");
    }
  } catch (err: any) {
    console.error(err);
    return sendErrorResponse(res);
  }
};
