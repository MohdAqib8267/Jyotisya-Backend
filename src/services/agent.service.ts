import moment from "moment";
import { AxiosError } from "axios";
import {
  agent,
  AGENT_ROLE,
  BOOKING_STATUS,
  CALENDAR_STATUS,
  CONVERSATION_TYPE,
  BOOKING_TYPE,
  Prisma,
  agent_booking,
  phone_call,
  lead_status,
  user,
  EXTENSION_STATUS,
  CREDIT_EVENT,
  agent_live_status,
} from "@prisma/client";
import { BaseService } from "./base.service";
import {
  AgentEarningDetails,
  AgentServiceParams,
  AttendanceDetails,
  UpsellDetails,
} from "../types";
import { getActiveRM } from "../scripts/googleapis/getAgents/rm";
import { _buildError, _logError } from "../utils/error";
import prisma from "../data/index";
import * as bcrypt from "bcrypt";
import { utcOffsetMinsToMySQLOffset } from "../utils/common/dateTimeUtils";
import { COMPANY_COMMISSION_PERCENT } from "../constants";
import { log } from "winston";

export default class AgentService extends BaseService {
  constructor(params: AgentServiceParams) {
    super(params);
  }

  validateData(data: any) {
    return true;
  }

  async getAgentById(agent_id: number) {
    const agent = await prisma.agent.findUnique({
      where: {
        agent_id,
      },
    });
    if (!agent) {
      return null;
    }

    const agency = agent?.agency_id
      ? await prisma.agency.findUnique({
          where: { agency_id: agent?.agency_id! },
        })
      : await prisma.agency.findFirst({ where: { agency_name: "Jyotisya" } });
    return {
      ...agent,
      agency_info: {
        agency_name: agency?.agency_name,
        agency_id: agency?.agency_id,
      },
    };
  }
 
  async  updateAgentForBooking(booking_id: number, astro_id: number) {
    return await prisma.agent_booking.update({
      where: {
       booking_id
      },
      data: {
        astro_id: astro_id
      }
    });
  }

  async getAgentByPhoneNumber(phone_number: string) {
    return await prisma.agent.findUnique({
      where: {
        phone_number,
      },
    });
  }

  async getAgentLiveStatusById(agent_id: number, online_only: boolean = false) {
    return await prisma.agent_live_status.findFirst({
      where: {
        agent_id,
        is_online: online_only ? true : undefined,
      },
    });
  }

  getOneAgentAvailableRightNow = async (
    forDurationMins: number = 5,
    excludeAgentIds: number[] = [],
    exclusiveCheckAgentId: number = 0,
    agent_role: AGENT_ROLE = AGENT_ROLE.ASTRO
  ) => {
    const now = new Date();
    const bufferMins = 2;
    const tentative_call_end_time = new Date(
      now.getTime() + (forDurationMins + bufferMins) * 60 * 1000
    );

    const nextBookingAtCondition = {
      OR: [
        {
          next_booking_at: null,
        },
        {
          next_booking_at: {
            gt: tentative_call_end_time,
          },
        },
      ],
    };

    const excludeAgentsCondition: Prisma.agentWhereInput = {};
    const exclusiveCheckAgentIdCondition: Prisma.agentWhereInput = {};

    if (exclusiveCheckAgentId > 0) {
      exclusiveCheckAgentIdCondition.agent_id = exclusiveCheckAgentId;
    }

    const agents_with_pending_leads = await prisma.agent_booking.findMany({
      where: {
        booking_status: BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO,
      },
      distinct: ["astro_id"],
      select: {
        astro_id: true,
      },
    });

    const agentIdsWithPendingLeads = agents_with_pending_leads.map(
      (agent) => agent.astro_id
    );

    excludeAgentIds = [...excludeAgentIds, ...agentIdsWithPendingLeads];

    if (excludeAgentIds.length > 0) {
      excludeAgentsCondition.agent_id = {
        notIn: excludeAgentIds,
      };
    }

    const agent_status_list = await prisma.agent_live_status.findMany({
      where: {
        is_on_call: false,
        // has_pending_leads: false,
        ...nextBookingAtCondition,
        ...excludeAgentsCondition,
        ...exclusiveCheckAgentIdCondition,
        OR: [
          {
            is_online: true,
          },
          {
            is_calendar_free: true,
          },
        ],
        is_active: true,
      },
      orderBy: [{ is_online: "desc" }, { is_calendar_free: "desc" }],
    });

    const online_list = agent_status_list.filter((agent) => agent.is_online);
    if (online_list.length > 0) {
      return this.getHighestPriorityAgent(online_list);
    }

    const calendar_free_list = agent_status_list.filter(
      (agent) => !agent.is_online && agent.is_calendar_free
    );
    if (calendar_free_list.length > 0) {
      return this.getHighestPriorityAgent(calendar_free_list);
    }
    return null;
  };

  getHighestPriorityAgent = async ( agent_list: agent_live_status[]) => {
    const agent_priority_list = (await prisma.agent.findMany({
      where: {
        agent_id: {
          in: agent_list.map((agent) => agent.agent_id),
        },
      },
    })).sort((a, b) => (a.selection_priority > b.selection_priority) ? -1 : 1);
    
    if(agent_priority_list.length > 0) {
      return this.getAgentById(agent_priority_list[0].agent_id);
    }
    return null;
  }
  
  getOngoingCallBooking = async (agent_id: number) => {
    return await prisma.agent_booking.findFirst({
      where: {
        astro_id: agent_id,
        booking_status: BOOKING_STATUS.CALL_IN_PROGRESS,
      },
      orderBy: {
        updated_at: "desc",
      },
    });
  };

  getPendingFeedbackBooking = async (agent_id: number) => {
    return await prisma.agent_booking.findFirst({
      where: {
        astro_id: agent_id,
        booking_status: BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO,
      },
      orderBy: {
        updated_at: "desc",
      },
    });
  };

  getAllPendingFeedbackBookings = async (agent_id: number) => {
    return await prisma.agent_booking.findMany({
      where: {
        astro_id: agent_id,
        booking_status: BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO,
      },
      select: {
        booking_id: true,
        booking_uuid: true,
        user_id: true,
        is_new_user: true,
        user: {
          select: {
            user_uuid: true,
            user_name: true,
            birth_details: true,
          },
        },
      },
      orderBy: {
        updated_at: "desc",
      },
    });
  };

  getLiveCallForAgent = async (
    agent_id: number
  ): Promise<phone_call | null> => {
    return await prisma.phone_call.findFirst({
      where: {
        agent_id,
        is_ongoing: true,
      },
    });
  };

  setOnCall = async (
    agent_id: number,
    is_on_call: boolean,
    call_duration_mins: number = 0
  ) => {
    try {
      return await prisma.agent_live_status.update({
        where: {
          agent_id,
        },
        data: {
          is_on_call,
          busy_until: is_on_call
            ? new Date(Date.now() + call_duration_mins * 60 * 1000)
            : null,
        },
      });
    } catch (err) {
      return null;
    }
  };

  setPendingLeadsStatus = async (
    agent_id: number,
    has_pending_leads: boolean
  ) => {
    return await prisma.agent_live_status.update({
      where: {
        agent_id,
      },
      data: {
        has_pending_leads,
      },
    });
  };

  setNextBookingAt = async (agent_id: number, next_booking_at: Date) => {
    return await prisma.agent_live_status.update({
      where: {
        agent_id,
      },
      data: {
        next_booking_at,
      },
    });
  };

  setLastFailureAt = async (agent_id: number, last_failure_at: Date) => {
    return await prisma.agent_live_status.update({
      where: {
        agent_id,
      },
      data: {
        last_failure_at,
      },
    });
  };

  setLastSuccessAt = async (agent_id: number, last_success_at: Date) => {
    return await prisma.agent_live_status.update({
      where: {
        agent_id,
      },
      data: {
        last_success_at,
      },
    });
  };

  getOnlineStatus = async (agent_id: number) => {
    return await prisma.agent_live_status.findUnique({
      where: {
        agent_id,
      },
    });
  };

  updateOnlineStatus = async (agent_id: number, is_online: boolean) => {
    const now = new Date();
    const lastLogin = await prisma.agent_login_history.findFirst({
      where: {
        agent_id,
      },
      orderBy: {
        login_id: "desc",
      },
    });

    if (is_online && (!lastLogin || (lastLogin && lastLogin.logout_time))) {
      await prisma.agent_login_history.create({
        data: {
          agent_id,
          login_time: now,
        },
      });
    } else if (!is_online && lastLogin && !lastLogin.logout_time) {
      await prisma.agent_login_history.update({
        where: {
          login_id: lastLogin.login_id,
        },
        data: {
          logout_time: now,
        },
      });
    }

    return await prisma.agent_live_status.update({
      where: {
        agent_id,
      },
      data: {
        is_online,
      },
    });
  };

  markAbsent(
    agent_id: number,
    from_time: Date,
    to_time: Date,
    actor_id: number
  ) {
    return prisma.agent_booking.create({
      data: {
        order_id: 0,
        user_id: 0,
        astro_id: agent_id,
        rm_id: actor_id,
        booking_start_time: from_time,
        booking_end_time: to_time,
        booking_status: BOOKING_STATUS.SCHEDULED,
        booking_type: BOOKING_TYPE.BOOK_LATER,
        is_new_user: false,
        is_sticky_agent: false,
        conversation_type: CONVERSATION_TYPE.CALL,
        calendar_status: CALENDAR_STATUS.ABSENT,
        is_pushed_to_queue: true,
        show_on_astro_calendar: true,
      },
    });
  }

  cancelBooking(agent_id: number, booking_id: number, actor_id: number) {
    return prisma.agent_booking.update({
      where: {
        booking_id,
      },
      data: {
        booking_status: BOOKING_STATUS.CANCELLED,
      },
    });
  }

  updateBooking = async (
    booking_uuid: string,
    booking_data: Partial<agent_booking>
  ) => {
    delete booking_data.booking_id;
    delete booking_data.booking_uuid;

    try {
      const cleaned_booking_data =
        booking_data as Prisma.agent_bookingUpdateInput;

      return await prisma.agent_booking.update({
        where: {
          booking_uuid,
        },
        data: cleaned_booking_data,
      });
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  addNewAgent = async (
    agent_name: string,
    phone_number: string,
    company_number: string | null,
    role: AGENT_ROLE,
    agency_id: number,
    agent_earning_config_list: any[],
    agent_email: string | null = null
  ): Promise<agent | null> => {
    const agent_to_add: Prisma.agentCreateInput = {
      agent_name,
      phone_number,
      company_number,
      role,
      agent_email,
      is_active: true,
    };
    agent_to_add.agency = {
      connect: {
        agency_id: agency_id,
      },
    };

    try {
      const agent = await prisma.agent.create({
        data: agent_to_add,
      });

      if (agent.role === AGENT_ROLE.ASTRO) {
        await prisma.agent_live_status.create({
          data: {
            agent_id: agent.agent_id,
            is_online: false,
            is_calendar_free: false,
            is_on_call: false,
            has_pending_leads: false,
            next_booking_at: null,
            busy_until: null,
            last_failure_at: null,
            last_success_at: null,
            is_active: true,
          },
        });
        const val = await Promise.all(
          agent_earning_config_list.map((config) => {
            return prisma.agent_earning_config.create({
              data: {
                agent_id: agent.agent_id,
                agency_id: agency_id,
                category_id: config.category_id,
                agent_commission_percent: parseInt(config.earning_perc, 10),
                company_commission_percent: COMPANY_COMMISSION_PERCENT,
                agency_commission_percent:
                  100 -
                  (parseInt(config.earning_perc, 10) +
                    COMPANY_COMMISSION_PERCENT),
              },
            });
          })
        );
        console.log(val);
      }

      return agent;
    } catch (err: any) {
      // _logError(this._logger, "ADD_NEW_AGENT", err, agent_to_add);
      // throw _buildError(this._logger, "ADD_NEW_AGENT", "failed to add new agent", err);
      console.error(err);
    }

    return null;
  };

  async validateCredential(
    username: string,
    plainTextPassword: string
  ): Promise<boolean | number> {
    const agent = await this.getAgentByPhoneNumber(username);
    console.log(agent?.phone_number)

    if (agent) {
      const agent_login_details = await prisma.agent_credential.findUnique({
        where: {
          agent_id: agent.agent_id,
        },
      });

      if (agent_login_details) {
        const hashedPassword = agent_login_details.password;
        // const passwordMatched = await this.comparePassword(
        //   plainTextPassword,
        //   hashedPassword
        // );

        const passwordMatched=agent_login_details.password===agent.phone_number?true:false;
        if (passwordMatched) {
          return agent.agent_id;
        } 
  
        return passwordMatched;
      }
    }

    return false;
  }

  async hashPassword(plainTextPassword: string): Promise<string> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);
    return hashedPassword;
  }

  async comparePassword(
    plainTextPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    const result = await bcrypt.compare(plainTextPassword, hashedPassword);
    return result;
  }

  async saveCredential(
    agentId: number,
    plainTextPassword: string
  ): Promise<boolean> {
    try {
      const agentLoginCredentials = await prisma.agent_credential.create({
        data: {
          agent_id: agentId,
          password: await this.hashPassword(plainTextPassword),
        },
      });

      return Boolean(agentLoginCredentials);
    } catch (e) {
      return false;
    }
  }

  _getRM = async (timeStamp: string) => {
    console.log(timeStamp);
    const active_rm = await getActiveRM(timeStamp);
    this._logger.info({
      stage: "FET",
      data: {
        active_rm,
      },
      info: "LIST_OF_ACTIVE_RM",
    });
    if (!active_rm.length) {
      return { name: "Apsara", agent_id: "cle64kc4q0000sb7dzy8kyzhg" };
    }
    return active_rm[Math.floor(Math.random() * active_rm.length)];
  };

  assignRM = async (lead_id: number) => {
    if (!lead_id) {
      throw _buildError(this._logger, "FETCH_LEAD", "failed to find lead_id", {
        lead_id,
      });
    }
    const timeStamp = moment()
      .tz("Asia/Kolkata")
      .format("DD-MM-YYYY hh:mm:ss a");
    const rm = await this._getRM(timeStamp);
    const lead = (await this.leadStatusRepo.findOneById(
      "lead_id",
      lead_id
    )) as lead_status | null;
    if (!lead) {
      throw _buildError(this._logger, "FETCH_LEAD", "failed to find lead", {
        lead,
      });
    }
    const lead_status = await this.leadStatusRepo.addNewLead({
      lead_type: "RM",
      agent_id: rm.agent_id,
      user_id: lead.user_id,
      astro_lead_id: lead_id,
    });
    return {
      lead_status,
      name: rm.name,
    };
  };

  updateLeadForAgent = async (data: any, lead_type: string) => {
    const lead_id = parseInt(data?.leadid, 0);
    const lead_status = data?.["status"] as string;
    const rating = parseInt(
      data?.rating?.trim() === "" || data?.rating === "null"
        ? "0"
        : data?.rating || "0",
      10
    );
    if (!lead_id) {
      _logError(this._logger, "LEAD_UPDATE_FOR_AGENT", "invalid leadId", {
        lead_id,
        lead_type,
      });
      return {
        status: 200,
        message: "Invalid lead Id, nothing updated.",
      };
    }
    if (!lead_status || lead_status.includes(",")) {
      _logError(this._logger, "LEAD_UPDATE_FOR_AGENT", "invalid leadId", {
        lead_id,
        lead_type,
        rating,
      });
    }
    const status =
      lead_type === "astro"
        ? this.config.status_map_astro[lead_status]
        : this.config.status_map_rm[lead_status];
    if (!status) {
      _logError(this._logger, "LEAD_UPDATE_FOR_AGENT", "status is falsy", {
        status,
        lead_id,
        lead_type,
        rating,
      });
    }
    try {
      if (lead_id && status) {
        await this.leadStatusRepo.updateLead(lead_id, status, rating);
        this._logger.info({
          stage: "updated astro lead",
          info: "",
          data: {
            lead_id,
            lead_status,
          },
        });
      }
      if (lead_type === "astro") {
        const { lead_status: new_lead_status, name } = await this.assignRM(
          lead_id
        );
        const user = (await this.userRepo.findOneById(
          "user_id",
          new_lead_status.user_id
        )) as user | null;

        if (!user) {
          return {
            message: "user not found",
            status: 400,
          };
        }

        const payload = {
          fields: {
            phone: user.phone_number,
            SalesRM: name,
            SalesID: new_lead_status.lead_id,
          },
        };
        await this.updateTeleCRM(payload);
        this._logger.info({
          stage: "send rm lead to telecrm",
          info: "",
          data: payload,
        });
      }
      return {
        message: "lead update successful",
        status: 200,
      };
    } catch (err: any) {
      console.log(err);
      const error = err as AxiosError;
      this._logger.error({
        error: err,
        stack: err.stack,
        message: error?.response?.statusText || err?.message,
        stage: "lead update",
        data: { lead_id, lead_type, rating, body_rating: data?.rating },
      });
      return {
        message: error?.response?.statusText || err?.message,
        status: error?.response?.status || 500,
      };
    }
  };

  updateActive = async (data: any) => {
    console.log(data);
    const { agent_id, ...filedsToupdate } = data;
    return this.agentRepo.update(filedsToupdate, "agent_id", agent_id);
  };

  getAllAgentsByRole = async (role: AGENT_ROLE = AGENT_ROLE.ASTRO) => {
    const agent = await prisma.agent.findMany({
      where: {
        role,
      },
    });

    return agent;
  };

  isAvailableAtTime = async (
    agent_id: number,
    check_start_time: Date,
    durationMins: number
  ) => {
    const check_end_time = new Date(
      check_start_time.getTime() + durationMins * 60 * 1000
    );

    const overlapping_bookings = await prisma.agent_booking.findMany({
      where: {
        astro_id: agent_id,
        booking_start_time: {
          lte: check_end_time,
        },
        booking_end_time: {
          gte: check_start_time,
        },
      },
    });

    return overlapping_bookings.length === 0;
  };

  getPendingSessionLeads = async (agent_id: number) => {
    const now = new Date();
    const now_plus_10_mins = new Date(now.getTime() + 10 * 60 * 1000);

    const bookings = await prisma.agent_booking.findMany({
      where: {
        user: {
          user_agent_mapping: {
            some: {
              agent_role: AGENT_ROLE.ASTRO,
              agent_id: agent_id,
            },
          },
        },
        order: {
          order_line_items: {
            none: {
              sku_id: 1,
            },
          },
          order_status: "ORDERED",
        },
        OR: [
          {
            booking_start_time: null,
            booking_status: {
              notIn: [
                BOOKING_STATUS.COMPLETED,
                BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO,
                BOOKING_STATUS.AWAITING_USER_FEEDBACK_RM,
              ],
            },
          },
          {
            booking_start_time: {
              gte: now,
              lte: now_plus_10_mins,
            },
            booking_status: "SCHEDULED",
            booking_retry_count: {
              gte: 0,
            },
          },
        ],
      },
      select: {
        booking_uuid: true,
        user: {
          select: {
            user_name: true,
            birth_details: true,
          },
        },
        order: {
          select: {
            total_amount_inr: true,
          },
        },
        sku: {
          select: {
            sku_name: true,
          },
        },
        // user_concerns: {
        //   select: {
        //     concern: {
        //       select: {
        //         concern_name: true,
        //       },
        //     },
        //   },
        // },
        // phone_calls: {
        //   where: {
        //     user_answered_at: {
        //       not: null,
        //     },
        //   },
        //   select: {
        //     user_answered_at: true,
        //   },
        //   orderBy: {
        //     user_answered_at: "desc",
        //   },
        //   take: 1,
        // },
        // agent_booking_extensions: {
        //   where: {
        //     extended_by_agent_id: agent_id,
        //     extension_status: EXTENSION_STATUS.AWAITING_PAYMENT,
        //   },
        //   select: {
        //     child_order: {
        //       select: {
        //         total_amount_inr: true,
        //       },
        //     },
        //     extension_sku: {
        //       select: {
        //         sku_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     extension_id: "desc",
        //   },
        //   take: 1,
        // },
        // agent_booking_feedbacks: {
        //   orderBy: {
        //     feedback_id: "desc",
        //   },
        // },
      },
      take: 20,
      orderBy: {
        created_at: "desc",
      },
    });

    const pendingSessionLeads: any[] = [];

    for (const booking of bookings) {
      const allSelectedOptions: string[] = [];
      const notes: string[] = [];

      const feedbackSummary = [...new Set(allSelectedOptions)];

      const pendingSessionlead = {
        booking_uuid: booking.booking_uuid,
        user: {
          user_name: booking.user?.user_name,
          birth_details: booking.user?.birth_details,
        },
        value: booking.order?.total_amount_inr || 0,
        sku_name: booking.sku?.sku_name || "",
        feedback: feedbackSummary,
        concerns: [],
        notes: notes,
      };

      pendingSessionLeads.push(pendingSessionlead);
    }

    return pendingSessionLeads;
  };

  getPendingPaymentLeads = async (agent_id: number) => {
    const bookings = await prisma.agent_booking.findMany({
      where: {
        agent_booking_extensions: {
          some: {
            extended_by_agent_id: agent_id,
            extension_status: EXTENSION_STATUS.AWAITING_PAYMENT,
          },
        },
        booking_status: {
          in: [
            BOOKING_STATUS.AWAITING_USER_FEEDBACK_RM,
            BOOKING_STATUS.COMPLETED,
          ],
        },
      },
      select: {
        booking_uuid: true,
        user: {
          select: {
            user_name: true,
            birth_details: true,
          },
        },
        user_concerns: {
          select: {
            concern: {
              select: {
                concern_name: true,
              },
            },
          },
        },
        phone_calls: {
          where: {
            user_answered_at: {
              not: null,
            },
          },
          select: {
            user_answered_at: true,
          },
          orderBy: {
            user_answered_at: "desc",
          },
          take: 1,
        },
        agent_booking_extensions: {
          where: {
            extended_by_agent_id: agent_id,
            extension_status: EXTENSION_STATUS.AWAITING_PAYMENT,
          },
          select: {
            child_order: {
              select: {
                total_amount_inr: true,
              },
            },
            extension_sku: {
              select: {
                sku_name: true,
              },
            },
          },
          orderBy: {
            extension_id: "desc",
          },
          take: 1,
        },
        agent_booking_feedbacks: {
          orderBy: {
            feedback_id: "desc",
          },
        },
      },
      take: 20,
      orderBy: {
        created_at: "desc",
      },
    });

    const potentialLeads: any[] = [];

    for (const booking of bookings) {
      const agent_booking_feedbacks = booking.agent_booking_feedbacks;
      const latest_feedback = agent_booking_feedbacks[0];

      // Hide the leads where the latest feedback is "Not Interested"
      // if (
      //   latest_feedback &&
      //   latest_feedback.selected_options &&
      //   Object.keys(latest_feedback.selected_options).includes("Not Interested")
      // ) {
      //   continue;
      // }

      const allSelectedOptions: string[] = [];
      const notes: string[] = [];

      agent_booking_feedbacks.forEach((feedback: any) => {
        if (feedback.agent_notes && feedback.agent_notes.length > 0) {
          notes.push(feedback.agent_notes);
        }

        const selectedOptions = feedback.selected_options;
        const keys = Object.keys(selectedOptions);
        keys.forEach((key) => {
          const keyLowerCase = key.toLowerCase();
          if (keyLowerCase.startsWith("interested in")) {
            if (key === "Interested in") {
              if (selectedOptions[key].length > 0) {
                for (const value of selectedOptions[key]) {
                  if (!allSelectedOptions.includes(`${key} ${value}`)) {
                    allSelectedOptions.push(`${key} ${value}`);
                  }
                }
              }
            } else if (keyLowerCase.startsWith("interested in ")) {
              allSelectedOptions.push(key);
            }
          }
        });
      });

      const feedbackSummary = [...new Set(allSelectedOptions)];

      const potentialLead = {
        booking_uuid: booking.booking_uuid,
        latest_feedback: latest_feedback,
        user: {
          user_name: booking.user?.user_name,
          birth_details: booking.user?.birth_details,
        },
        value:
          booking.agent_booking_extensions[0]?.child_order?.total_amount_inr,
        sku_name: booking.agent_booking_extensions[0]?.extension_sku?.sku_name,
        feedback: feedbackSummary,
        last_call_date: booking.phone_calls[0]?.user_answered_at?.toISOString(),
        concerns: booking.user_concerns.map(
          (user_concern) => user_concern.concern.concern_name
        ),
        notes: notes,
      };

      potentialLeads.push(potentialLead);
    }

    return potentialLeads;
  };

  getPendingFeedbackLeads = async (agent_id: number) => {
    const bookings = await prisma.agent_booking.findMany({
      where: {
        astro_id: agent_id,
        // booking_status: {
        //   in: [BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO],
        // },
      },
      select: {
        booking_uuid: true,
        order: {
          select: {
            total_amount_inr: true,
          },
        },
        sku: {
          select: {
            sku_name: true,
          },
        },
        user: {
          select: {
            user_name: true,
            birth_details: true,
          },
        },
        phone_calls: {
          where: {
            user_answered_at: {
              not: null,
            },
          },
          select: {
            agent_called_at: true,
            user_answered_at: true,
            hangup_at: true,
          },
          orderBy: {
            user_answered_at: "desc",
          },
          take: 1,
        },
      },
      take: 20,
    });

    const pendingFeedbackLeads: any[] = [];

    for (const booking of bookings) {
      const pendingFeedbackLead = {
        booking_uuid: booking.booking_uuid,
        user: {
          user_name: booking.user?.user_name,
          birth_details: booking.user?.birth_details,
        },
        value: booking.order?.total_amount_inr,
        sku_name: booking.sku?.sku_name,
        last_call_date: booking.phone_calls[0]?.user_answered_at?.toISOString(),
        call_duration:
          booking.phone_calls[0]?.user_answered_at &&
          booking.phone_calls[0]?.hangup_at
            ? Math.round(
                (booking.phone_calls[0]?.hangup_at.getTime() -
                  booking.phone_calls[0]?.user_answered_at.getTime()) /
                  1000
              )
            : 0,
      };

      pendingFeedbackLeads.push(pendingFeedbackLead);
    }

    pendingFeedbackLeads.sort((a, b) => {
      if (a.last_call_date && b.last_call_date) {
        return (
          new Date(b.last_call_date).getTime() -
          new Date(a.last_call_date).getTime()
        );
      } else if (a.last_call_date) {
        return -1;
      } else if (b.last_call_date) {
        return 1;
      } else {
        return 0;
      }
    });

    return pendingFeedbackLeads;
  };

  getCallLogs = async (agent_id: number, last_call_id: number) => {
    const pagination_condition: Prisma.phone_callWhereInput = {};

    if (last_call_id) {
      pagination_condition.call_id = {
        lt: last_call_id,
      };
    }

    const phone_calls = await prisma.phone_call.findMany({
      where: {
        agent_id: agent_id,
        user_answered_at: {
          not: null,
        },
        ...pagination_condition,
      },
      select: {
        call_id: true,
        call_uuid: true,
        agent_id: true,
        user_answered_at: true,
        hangup_at: true,
        booking: {
          select: {
            booking_uuid: true,
            order: {
              select: {
                total_amount_inr: true,
              },
            },
            sku: {
              select: {
                sku_name: true,
              },
            },
            user: {
              select: {
                user_name: true,
                birth_details: true,
              },
            },
            user_concerns: {
              select: {
                concern: {
                  select: {
                    concern_name: true,
                  },
                },
              },
            },
            agent_booking_feedbacks: {
              orderBy: {
                feedback_id: "desc",
              },
            },
          },
        },
      },
      take: 20,
      orderBy: {
        call_id: "desc",
      },
    });

    const callLogs: any[] = [];

    for (const call of phone_calls) {
      const agent_booking_feedbacks = call.booking.agent_booking_feedbacks;
      const latest_feedback = agent_booking_feedbacks[0];

      const allSelectedOptions: string[] = [];

      const notes: string[] = [];

      agent_booking_feedbacks.forEach((feedback: any) => {
        if (feedback.agent_notes && feedback.agent_notes.length > 0) {
          notes.push(feedback.agent_notes);
        }
        const selectedOptions = feedback.selected_options;
        const keys = Object.keys(selectedOptions);
        keys.forEach((key) => {
          const keyLowerCase = key.toLowerCase();
          if (
            keyLowerCase.startsWith("interested in") ||
            keyLowerCase.startsWith("not interested")
          ) {
            if (
              keyLowerCase === "interested in" ||
              keyLowerCase === "not interested"
            ) {
              if (selectedOptions[key].length > 0) {
                for (const value of selectedOptions[key]) {
                  if (!allSelectedOptions.includes(`${key} ${value}`)) {
                    allSelectedOptions.push(`${key}: ${value}`);
                  }
                }
              }
            } else if (keyLowerCase.startsWith("interested in ")) {
              allSelectedOptions.push(key);
            } else {
              allSelectedOptions.push(key);
            }
          } else {
            allSelectedOptions.push(key);
          }
        });
      });

      const feedbackSummary = [...new Set(allSelectedOptions)];

      const callInfo = {
        call_uuid: call.call_uuid,
        booking_uuid: call.booking.booking_uuid,
        latest_feedback: latest_feedback,
        user: {
          user_name: call.booking.user?.user_name,
          birth_details: call.booking.user?.birth_details,
        },
        value: call.booking.order?.total_amount_inr || 0,
        sku_name: call.booking.sku.sku_name,
        feedback: feedbackSummary,
        last_call_date: call.user_answered_at?.toISOString(),
        call_duration:
          call.user_answered_at && call.hangup_at
            ? Math.round(
                (call.hangup_at.getTime() - call.user_answered_at.getTime()) /
                  1000
              )
            : 0,
        concerns: call.booking.user_concerns.map(
          (user_concern) => user_concern.concern.concern_name
        ),
        notes: notes,
      };

      callLogs.push(callInfo);
    }

    // const callRecord = {
    //   call_uuid: record.call_uuid,
    //   is_new_user: new_user?.is_new_user,
    //   user: {
    //     user_name: user?.user_name,
    //     birth_details: user?.birth_details,
    //   },
    //   value: order?.total_amount_inr,
    //   // booking_id: record.booking_id,
    //   // interested_feedback: interestedFeedback,
    //   feedback: interestedInList,
    //   concerns: concern_names,
    //   call_time: formattedDate,
    //   daysBack: daysBack,
    // };

    return {
      call_logs: callLogs,
      pagination_token:
        phone_calls.length > 0
          ? phone_calls[phone_calls.length - 1].call_id
          : 0,
    };
  };

  getAgentAnalytics = async (
    agent_id: number,
    from_date: string,
    to_date: string,
    utc_offset_mins: number
  ) => {
    const time_zone_offset = utcOffsetMinsToMySQLOffset(utc_offset_mins);

    // const call_count = await prisma.phone_call.count({
    //   where: {
    //     agent_id: agent_id,
    //     agent_called_at: {
    //       not: null,
    //       gte: from_date,
    //       lt: to_date,
    //     },
    //   },
    // });

    const from_date_utc = moment(`${from_date} 00:00:00`, "YYYY-MM-DD HH:mm:ss")
      .add(utc_offset_mins, "minutes")
      .toDate();
    const to_date_utc = moment(`${to_date} 23:59:59`, "YYYY-MM-DD HH:mm:ss")
      .add(utc_offset_mins, "minutes")
      .toDate();

    const agent_50_pc = [41, 43, 45, 46, 48];

    const commission_pc = agent_50_pc.includes(agent_id) ? 0.5 : 0.7;

    const earning_details = (await prisma.$queryRaw`
    SELECT SUM(ROUND(total_amount_inr * ${commission_pc}, 2)) as total_earning
    FROM agent_booking b
      LEFT JOIN \`order\` o ON b.order_id = o.order_id
      LEFT JOIN (SELECT booking_id, MIN(created_at) as response_date FROM feedback_response WHERE parent_option_id != 202 GROUP BY 1) f ON b.booking_id = f.booking_id
      LEFT JOIN (SELECT child_booking_id, updated_at as extension_date FROM agent_booking_extension WHERE extension_status = 'COMPLETED') e ON b.booking_id = e.child_booking_id
    WHERE b.astro_id = ${agent_id}
    AND sku_id != 1
    AND COALESCE(response_date, extension_date) IS NOT NULL
    AND DATE(CONVERT_TZ(COALESCE(response_date, extension_date), '+00:00', ${time_zone_offset})) BETWEEN ${from_date} AND ${to_date}
    `) as AgentEarningDetails[];

    const call_analytics = await prisma.phone_call.aggregate({
      where: {
        agent_id: agent_id,
        user_answered_at: {
          not: null,
          gte: from_date_utc,
          lt: to_date_utc,
        },
      },
      _sum: {
        call_duration_actual: true,
      },
      _count: {
        call_id: true,
      },
    });

    const upsell_details = (await prisma.$queryRaw`
      SELECT COUNT(*) as upsell_count
      FROM \`order\`
      WHERE order_id IN (SELECT order_id FROM agent_booking WHERE astro_id = ${agent_id})
        AND order_status = 'ORDERED'
        AND order_id NOT IN (SELECT order_id FROM order_line_item WHERE sku_id = 1)
        AND order_id IN (
          SELECT order_id
          FROM agent_booking b
             LEFT JOIN (SELECT booking_id, MIN(created_at) as response_date FROM feedback_response WHERE parent_option_id != 202 AND agent_id = ${agent_id} GROUP BY 1) f ON b.booking_id = f.booking_id
             LEFT JOIN (SELECT child_booking_id, updated_at as extension_date FROM agent_booking_extension WHERE extension_status = 'COMPLETED' AND extended_by_agent_id = ${agent_id}) e ON b.booking_id = e.child_booking_id
          WHERE COALESCE(response_date, extension_date) IS NOT NULL
            AND DATE(CONVERT_TZ(COALESCE(response_date, extension_date), '+00:00', ${time_zone_offset})) BETWEEN ${from_date} AND ${to_date}
        )
      `) as UpsellDetails[];

    const attendance_details = (await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT DATE(CONVERT_TZ(login_time, '+00:00', ${time_zone_offset}))) as days_logged_in
      FROM agent_login_history
      WHERE agent_id = ${agent_id}
      AND DATE(CONVERT_TZ(login_time, '+00:00', ${time_zone_offset})) BETWEEN ${from_date} AND ${to_date}
    `) as AttendanceDetails[];

    const avg_call_duration = call_analytics._sum.call_duration_actual
      ? call_analytics._sum.call_duration_actual / call_analytics._count.call_id
      : 0;

    const agent_details = await prisma.agent.findUnique({
      where: {
        agent_id: agent_id,
      },
      select: {
        agent_id: true,
        created_at: true,
      },
    });

    const agent_onboarding_date = agent_details?.created_at;

    const global_attendance_start_date = "2023-05-01";

    const dates = [global_attendance_start_date, from_date];

    if (agent_onboarding_date) {
      dates.push(
        moment(agent_onboarding_date)
          .add(utc_offset_mins, "minutes")
          .format("YYYY-MM-DD")
      );
    }

    const attendance_start_date = moment
      .max(dates.map((date) => moment(date)))
      .format("YYYY-MM-DD");

    const total_days_for_attendance =
      moment(to_date).diff(moment(attendance_start_date), "days") + 1;

    const agent_analytics = [
      {
        numbers: `${
          earning_details.length > 0 ? earning_details[0].total_earning || 0 : 0
        }`,
        text: "Earnings",
        icon_hint: "currency_inr",
        grid_col_size: "12",
      },
      {
        numbers: `${upsell_details[0].upsell_count}`,
        text: "Upsells",
        icon_hint: "shopping_cart",
        grid_col_size: "6",
      },
      {
        numbers: `${call_analytics._count.call_id} `,
        text: "Total Calls",
        icon_hint: "call",
        grid_col_size: "6",
      },
      {
        numbers: `${attendance_details[0].days_logged_in}/${Math.max(
          0,
          total_days_for_attendance
        )}`,
        text: "Days Logged In",
        icon_hint: "calendar",
        grid_col_size: "6",
      },
      {
        numbers: `${(avg_call_duration / 60).toFixed(1)} mins`,
        text: "Average Call Duration",
        icon_hint: "timer",
        grid_col_size: "6",
      },
    ];

    return agent_analytics;
  };

  getAgencyDefaultEarningConfig = async (
    agency_id: number,
    category_id?: number
  ) => {
    if (!category_id) {
      return prisma.agency_default_earning_config.findMany({
        where: {
          agency_id: agency_id,
        },
      });
    }
    return Promise.all([
      prisma.agency_default_earning_config.findUnique({
        where: {
          default_agency_config: {
            agency_id: agency_id,
            category_id: category_id,
          },
        },
      }),
    ]);
  };

  setAgencyDefaultEarningConfig = async (
    agency_id: number,
    earning_config: any[]
  ) => {
    return Promise.all(
      earning_config.map((config) => {
        return prisma.agency_default_earning_config.upsert({
          where: {
            default_agency_config: {
              agency_id: agency_id,
              category_id: config.category_id,
            },
          },
          update: {
            agency_commission_percent: config.agency_commission_percent,
            agent_commission_percent: config.agent_commission_percent,
            company_commission_percent: config.company_commission_percent,
          },
          create: {
            agency_id,
            category_id: config.category_id,
            agency_commission_percent: config.agency_commission_percent,
            agent_commission_percent: config.agent_commission_percent,
            company_commission_percent: config.company_commission_percent,
          },
        });
      })
    );
  };

  getAgentEarningConfig = async (agent_id: number, category_id?: number) => {
    if (!category_id) {
      return prisma.agent_earning_config.findMany({
        where: {
          agent_id: agent_id,
        },
      });
    }
    return Promise.all([
      prisma.agent_earning_config.findUnique({
        where: {
          agent_earning_config_unique: {
            agent_id: agent_id,
            category_id: category_id,
          },
        },
      }),
    ]);
  };

  setAgentEarningConfig = async (
    agent_id: number,
    agency_id: number,
    earning_config: any[]
  ) => {
    const agency_default_earning_config =
      await this.getAgencyDefaultEarningConfig(agency_id);
    return Promise.all(
      earning_config.map((config) => {
        return prisma.agent_earning_config.upsert({
          where: {
            agent_earning_config_unique: {
              agent_id: agent_id,
              category_id: config.category_id,
            },
          },
          update: {
            agent_commission_percent: config.agent_commission_percent,
            company_commission_percent: config.company_commission_percent,
            agency_commission_percent:
              config.agency_commission_percent ||
              agency_default_earning_config?.find(
                (c) => c?.category_id === config.category_id
              )?.agency_commission_percent ||
              0,
          },
          create: {
            agent_id,
            agency_id,
            category_id: config.category_id,
            agent_commission_percent: config.agent_commission_percent,
            company_commission_percent: config.company_commission_percent,
            agency_commission_percent:
              config.agency_commission_percent ||
              agency_default_earning_config.find(
                (c) => c?.category_id === config.category_id
              )?.agency_commission_percent ||
              0,
          },
        });
      })
    );
  };

  setAgentEarningHistory = async (agent_id: number, booking_id: number) => {
    const booking = await prisma.agent_booking.findUnique({
      where: { booking_id: booking_id },
    });
    if (!booking) {
      throw _buildError(
        this._logger,
        "AGENT_EARNING_HISTORY",
        "Booking not found",
        { booking_id }
      );
    }
    const agent_earning_config_list = await this.getAgentEarningConfig(
      agent_id,
      booking.sku_id
    );
    const payment = await prisma.payment_link.findUnique({
      where: { payment_link_id: booking.payment_link_id },
    });
    if (
      !payment ||
      !agent_earning_config_list ||
      agent_earning_config_list.length === 0
    ) {
      throw _buildError(
        this._logger,
        "UPDATE AGENT EARNING HISTORY",
        "MISSING DATA",
        {
          agent_id,
          booking_id,
          agent_earning_config_list,
          payment,
        }
      );
    }
    const agent_earning_config = agent_earning_config_list.find(
      (config) => config?.category_id === booking.sku_id
    );
    if (!agent_earning_config) {
      throw _buildError(
        this._logger,
        "UPDATE AGENT EARNING HISTORY",
        "MISSING DATA",
        {
          agent_id,
          booking_id,
          agent_earning_config,
        }
      );
    }
    const agent_earning_history = await prisma.agent_earning_history.create({
      data: {
        agent_id,
        booking_id,
        sku_id: booking.sku_id,
        agent_commission_inr: Math.round(
          (payment.payment_amount_inr.toNumber() *
            agent_earning_config.agent_commission_percent.toNumber()) /
            100
        ),
        agency_commission_inr: Math.round(
          (payment.payment_amount_inr.toNumber() *
            agent_earning_config.agency_commission_percent.toNumber()) /
            100
        ),
        company_commission_inr: Math.round(
          (payment.payment_amount_inr.toNumber() *
            agent_earning_config.company_commission_percent.toNumber()) /
            100
        ),
        credit_reason: booking.is_extended
          ? CREDIT_EVENT.BOOKING_FEEDBACK_SUBMIT
          : CREDIT_EVENT.BOOKING_FEEDBACK_SUBMIT,
      },
    });
    return true;
  };
}
