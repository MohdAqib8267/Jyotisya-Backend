import {
  agent,
  agent_booking,
  AGENT_ROLE,
  BOOKING_STATUS,
  CALLER_ROLE,
  CALL_PAYMENT_TYPE,
  CALL_TYPE,
  phone_call,
  phone_call_rm,
  Prisma,
} from "@prisma/client";
import axios from "axios";
import { Request, Response } from "express";
import appConfig from "../../config";
import prisma from "../../data";
import { CallResult } from "../../types";
import { v4 as uuidV4 } from "uuid";
import {
  agentService,
  orderService,
  userService,
} from "../../services/services.factory";
import { sendRescheduleMessage } from "../wati/watiLib";

export const processKnowlarityEvent = async (knowlarityEvent: any) => {
  await prisma.events_knowlarity.create({
    data: {
      data: knowlarityEvent,
    },
  });

  const telephony_provider_call_id = knowlarityEvent.uuid;

  if (telephony_provider_call_id.length === 0) {
    return false;
  }

  const call_master_info = await prisma.phone_call_master.findUnique({
    where: {
      call_id_3p_unique_master: {
        telephony_provider_id: 1,
        telephony_provider_call_id,
      },
    },
  });

  if (call_master_info?.call_type === CALL_PAYMENT_TYPE.PAID) {
    const call_info = await prisma.phone_call.findUnique({
      where: {
        call_id_3p_unique: {
          telephony_provider_id: 1,
          telephony_provider_call_id,
        },
      },
    });
    if (!call_info) {
      return false;
    }
    await processEventPreBookedCalls(call_info, knowlarityEvent);
    return true;
  } else if (call_master_info?.call_type === CALL_PAYMENT_TYPE.NON_PAID) {
    const call_info = await prisma.phone_call_rm.findUnique({
      where: {
        call_id_3p_unique_rm: {
          telephony_provider_id: 1,
          telephony_provider_call_id,
        },
      },
    });
    if (!call_info) {
      return false;
    }
    await processEventNonPreBookedCalls(call_info, knowlarityEvent);
    return true;
  }
  return false;
};

const processEventNonPreBookedCalls = async (
  call_info: phone_call_rm,
  knowlarityEvent: any
) => {
  const agent_id = call_info.agent_id;
  const updated_call_info: Prisma.phone_callUpdateInput = {};
  let shouldMarkAgentFree = false;

  if (Object.keys(knowlarityEvent).includes("event_type")) {
    const event_type = knowlarityEvent.event_type;

    const date_utc = new Date(
      new Date(knowlarityEvent.event_date_local).getTime() - 5.5 * 3600 * 1000
    );

    switch (event_type) {
      case "AGENT_CALL":
        updated_call_info.agent_called_at = date_utc;
        updated_call_info.is_ongoing = true;
        await agentService.setOnCall(agent_id, true);
        break;

      case "AGENT_ANSWER":
        updated_call_info.agent_answered_at = date_utc;
        break;

      case "CUSTOMER_CALL":
        updated_call_info.user_called_at = date_utc;
        break;

      case "CUSTOMER_ANSWER":
        updated_call_info.user_answered_at = date_utc;
        break;

      case "HANGUP":
        updated_call_info.hangup_at = date_utc;
        updated_call_info.hangup_cause = knowlarityEvent.hangup_cause;
        updated_call_info.is_ongoing = false;
        shouldMarkAgentFree = true;

        // We receive two HANGUP events, one for each leg
        // We only want to update the booking and agent status once
        if (knowlarityEvent.leg_identifier === "agent") {
          updated_call_info.hangup_by = CALLER_ROLE.AGENT;
        } else if (knowlarityEvent.leg_identifier === "customer") {
          updated_call_info.hangup_by = CALLER_ROLE.USER;
        }
        break;
    }
  } else if (
    Object.keys(knowlarityEvent).includes("type") &&
    knowlarityEvent.type === "CDR"
  ) {
    updated_call_info.call_duration_actual = knowlarityEvent.call_duration;
    updated_call_info.is_ongoing = false;

    // knowlarityEvent.end_time is already in UTC
    const event_timestamp_utc = new Date(knowlarityEvent.end_time);

    // TODO: Calculate call_duration from hangup_at - user_answered_at and decide whether to retry or fulfill the call
    if (
      knowlarityEvent.call_duration > 0 &&
      call_info.user_called_at &&
      call_info.user_answered_at
    ) {
      updated_call_info.is_fulfilled = true;
    }

    // TODO: Upload to S3
    if (knowlarityEvent.resource_url) {
      updated_call_info.call_recording_url = knowlarityEvent.resource_url;
    }
  }

  if (Object.keys(updated_call_info).length > 0) {
    await prisma.phone_call_rm.update({
      where: {
        call_id: call_info.call_id,
      },
      data: updated_call_info,
    });
  }

  if (shouldMarkAgentFree) {
    await agentService.setOnCall(agent_id, false);
  }
};

const processEventPreBookedCalls = async (
  call_info: phone_call,
  knowlarityEvent: any
) => {
  const booking_id = call_info.booking_id;
  if (!booking_id) {
    return false;
  }
  const booking = await prisma.agent_booking.findUnique({
    where: {
      booking_id: booking_id,
    },
  });

  if (!booking) {
    return false;
  }
  const agent_id = booking.astro_id;

  const updated_call_info: Prisma.phone_callUpdateInput = {};
  const updated_booking_info: Prisma.agent_bookingUpdateInput = {};
  const updated_booking_tat: Prisma.agent_booking_tatUpdateInput = {};

  let shouldRetryCall = false;
  let retryAfterMins = 0;
  let shouldMarkAgentFree = false;

  if (Object.keys(knowlarityEvent).includes("event_type")) {
    const event_type = knowlarityEvent.event_type;

    const date_utc = new Date(
      new Date(knowlarityEvent.event_date_local).getTime() - 5.5 * 3600 * 1000
    );

    switch (event_type) {
      case "AGENT_CALL":
        updated_call_info.agent_called_at = date_utc;
        updated_call_info.is_ongoing = true;
        const call_duration_mins = Math.ceil(
          call_info.call_duration_ideal / 60
        );
        await agentService.setOnCall(agent_id, true, call_duration_mins);

        if (!booking.first_agent_call_ringed_at) {
          updated_booking_info.first_agent_call_ringed_at = date_utc;
          updated_booking_tat.first_agent_call_ringed_at = date_utc;
        }
        break;

      case "AGENT_ANSWER":
        updated_call_info.agent_answered_at = date_utc;
        if (!booking.first_agent_call_answered_at) {
          updated_booking_info.first_agent_call_answered_at = date_utc;
          updated_booking_tat.first_agent_call_answered_at = date_utc;
        }
        break;

      case "CUSTOMER_CALL":
        updated_call_info.user_called_at = date_utc;
        if (!booking.first_user_call_ringed_at) {
          updated_booking_info.first_user_call_ringed_at = date_utc;
          updated_booking_tat.first_user_call_ringed_at = date_utc;
        }
        break;

      case "CUSTOMER_ANSWER":
        updated_call_info.user_answered_at = date_utc;
        if (!booking.first_user_call_answered_at) {
          updated_booking_info.first_user_call_answered_at = date_utc;
          updated_booking_tat.first_user_call_answered_at = date_utc;

          updated_booking_info.is_sticky_agent = true;
          updated_booking_info.astro_id = agent_id;
          userService.setStickyAgent(
            call_info.user_id,
            call_info.agent_id,
            AGENT_ROLE.ASTRO
          );
        }
        break;

      case "HANGUP":
        updated_call_info.hangup_at = date_utc;
        updated_call_info.hangup_cause = knowlarityEvent.hangup_cause;
        updated_call_info.is_ongoing = false;
        updated_booking_info.booking_status =
          BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO;
        shouldMarkAgentFree = true;

        // We receive two HANGUP events, one for each leg
        // We only want to update the booking and agent status once
        if (knowlarityEvent.leg_identifier === "agent") {
          updated_call_info.hangup_by = CALLER_ROLE.AGENT;

          //Agent and user did not connect
          if (!call_info.agent_answered_at || !call_info.user_answered_at) {
            // If the call was initiated by the system, retry the call
            if (call_info.initiated_by === CALLER_ROLE.SYSTEM) {
              shouldRetryCall = true;
            }
            // If the call was initiated by the agent or the user, restore the booking status
            else {
            }
          }
        } else if (knowlarityEvent.leg_identifier === "customer") {
          updated_call_info.hangup_by = CALLER_ROLE.USER;
        }

        if (
          booking.first_user_call_answered_at &&
          !booking.first_user_call_hangup_at
        ) {
          updated_booking_info.first_user_call_hangup_at = date_utc;
          updated_booking_tat.first_user_call_hangup_at = date_utc;
        }

        break;
    }
  } else if (
    Object.keys(knowlarityEvent).includes("type") &&
    knowlarityEvent.type === "CDR"
  ) {
    updated_call_info.call_duration_actual = knowlarityEvent.call_duration;
    updated_call_info.is_ongoing = false;

    // knowlarityEvent.end_time is already in UTC
    const event_timestamp_utc = new Date(knowlarityEvent.end_time);

    // TODO: Calculate call_duration from hangup_at - user_answered_at and decide whether to retry or fulfill the call
    if (
      knowlarityEvent.call_duration > 0 &&
      call_info.user_called_at &&
      call_info.user_answered_at
    ) {
      updated_call_info.is_fulfilled = true;
    }

    // TODO: Upload to S3
    if (knowlarityEvent.resource_url) {
      updated_call_info.call_recording_url = knowlarityEvent.resource_url;
    }
  }

  if (Object.keys(updated_call_info).length > 0) {
    await prisma.phone_call.update({
      where: {
        call_id: call_info.call_id,
      },
      data: updated_call_info,
    });
  }

  if (Object.keys(updated_booking_info).length > 0) {
    await prisma.agent_booking.update({
      where: {
        booking_id: booking.booking_id,
      },
      data: updated_booking_info,
    });
  }

  if (Object.keys(updated_booking_tat).length > 0) {
    await orderService.updateBookingTATMultiField(
      booking.booking_id,
      updated_booking_tat
    );
  }

  if (shouldMarkAgentFree) {
    await agentService.setOnCall(agent_id, false);
  }

  if (shouldRetryCall) {
    retryCall(booking, call_info);
  }

  return true;
};

const createCallErrorResult = (message: string): CallResult => {
  return {
    is_call_placed: false,
    call_id: 0,
    message,
  };
};

export const retryCall = async (
  booking: agent_booking,
  call_info: phone_call
) => {
  const booking_id = booking.booking_id;
  const batch_uuid = call_info.batch_uuid;
  const call_retry_count = call_info.call_retry_count;

  const after5Mins = new Date(Date.now() + 5 * 60 * 1000);
  const after4Hours = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const after24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // If agent did not answer the call
  if (!call_info.agent_answered_at) {
    // If sticky agent, reschedule the booking to after 5 minutes
    if (booking.is_sticky_agent) {
      await orderService.rescheduleBooking(booking.booking_id, after5Mins);
    }
    // If not sticky agent, reschedule the call immediately to try another agent
    else {
      await orderService.pushBookingToQueue(
        booking_id,
        batch_uuid,
        call_retry_count,
        true
      );
    }
  }
  // Agent answered the call, but user did not, ask the user for a new time
  // Irrespective of whether user phone ringed, we tried calling and failed
  else {
    await orderService.updateManyBookingStatus(
      [booking_id],
      BOOKING_STATUS.AWAITING_SCHEDULE_RM,
      false
    );
    await sendRescheduleMessage(booking.user_id);
    return;
  }

  // else if (call_retry_count < 1) {
  // // TODO: Add Logic to avoid non-business hours
  // // await orderService.rescheduleBooking(booking.booking_id, after4Hours);
  // }
};

export const makePreBookingCall = async (
  booking: agent_booking,
  agent_id: number,
  batch_uuid: string = "",
  call_retry_count: number = 0,
  initiated_by: CALLER_ROLE = CALLER_ROLE.SYSTEM
): Promise<CallResult> => {
  let is_call_placed = false;

  try {
    const booking_id = booking.booking_id;
    await agentService.setOnCall(
      agent_id,
      true,
      booking.booking_duration_mins + 2
    );

    await orderService.updateBookingTAT(booking_id, "last_call_attempted_at");

    const agent = await prisma.agent.findUnique({
      where: {
        agent_id,
      },
    });

    if (!agent) {
      return createCallErrorResult("Agent not found");
    }

    await prisma.agent_booking.update({
      where: {
        booking_id,
      },
      data: {
        astro_id: agent_id,
      },
    });

    const user_id = booking.user_id;
    const booking_retry_count = booking.booking_retry_count;

    const user = await prisma.user.findUnique({
      where: {
        user_id: user_id,
      },
    });

    if (!user) {
      return createCallErrorResult("User not found");
    }

    const astro_phone_number = agent.phone_number;
    const user_phone_number = user.calling_number
      ? user.calling_number
      : user.phone_number;

    const headers = {
      "x-api-key": process.env.KNOWLARITY_API_KEY,
      Authorization: process.env.KNOWLARITY_API_KEY_SR,
      "content-type": "application/json",
    };

    const requestBody = {
      k_number: process.env.KNOWLARITY_NUMBER,
      caller_id: process.env.KNOWLARITY_CALLER_ID,
      agent_number: `+${astro_phone_number}`,
      customer_number: `+${user_phone_number}`,
      // "additional_params": {
      //   "timeout": "5",
      //   "cust": user_id,
      // }
    };

    const apiResult = await axios.post(
      "https://kpi.knowlarity.com/Basic/v1/account/call/makecall",
      requestBody,
      { headers }
    );

    const apiResponse = apiResult.data;

    is_call_placed = !Boolean(apiResponse.error);

    const [phone_call_details, phone_call_master_details] = await Promise.all([
      prisma.phone_call.create({
        data: {
          batch_uuid: batch_uuid.length === 36 ? batch_uuid : uuidV4(),
          telephony_provider_id: 1,
          telephony_provider_call_id: is_call_placed
            ? apiResponse.success.call_id
            : null,
          booking_id,
          booking_retry_count,
          agent_id,
          user_id,
          call_retry_count,
          agent_phone_number: astro_phone_number as string,
          user_phone_number: user_phone_number as string,
          call_type: CALL_TYPE.OUTBOUND,
          initiated_by: initiated_by,
          initiated_at: is_call_placed ? new Date() : undefined,
          is_error: !is_call_placed,
          is_fulfilled: false,
          call_duration_ideal: booking.booking_duration_mins * 60,
          telephony_provider_response: apiResponse,
          is_ongoing: is_call_placed,
        },
      }),
      prisma.phone_call_master.create({
        data: {
          telephony_provider_id: 1,
          telephony_provider_call_id: is_call_placed
            ? apiResponse.success.call_id
            : null,
          call_type: CALL_PAYMENT_TYPE.PAID,
        },
      }),
    ]);

    if (!is_call_placed) {
      agentService.setOnCall(agent_id, false);
    }

    await prisma.agent_booking.update({
      where: {
        booking_id,
      },
      data: {
        is_active: is_call_placed,
        booking_status: is_call_placed
          ? BOOKING_STATUS.CALL_IN_PROGRESS
          : BOOKING_STATUS.CALL_ERROR,
      },
    });

    return {
      is_call_placed,
      call_id: phone_call_details.call_id,
      message: is_call_placed
        ? "Call placed successfully"
        : apiResponse.error.message,
    };
  } catch (error: any) {
    console.error(error);
    return createCallErrorResult(error.message);
  }
};

export const makeNonPreBookingCall = async (
  phone_number: string,
  agent_id: number,
  batch_uuid: string = "",
  call_retry_count: number = 0,
  initiated_by: CALLER_ROLE = CALLER_ROLE.SYSTEM
): Promise<CallResult> => {
  let is_call_placed = false;

  try {
    const agent = await prisma.agent.findUnique({
      where: {
        agent_id,
      },
    });

    if (!agent) {
      return createCallErrorResult("Agent not found");
    }
    const user = await prisma.user.findUnique({
      where: {
        // user_id: user_id,
        phone_number: phone_number,
      },
    });

    const rm_phone_number = agent.phone_number;

    const user_phone_number = user
      ? user.calling_number
        ? user.calling_number
        : user.phone_number
      : phone_number;

    const headers = {
      "x-api-key": process.env.KNOWLARITY_API_KEY,
      Authorization: process.env.KNOWLARITY_API_KEY_SR,
      "content-type": "application/json",
    };

    const requestBody = {
      k_number: process.env.KNOWLARITY_NUMBER,
      caller_id: process.env.KNOWLARITY_CALLER_ID,
      agent_number: `+${rm_phone_number}`,
      customer_number: `+${user_phone_number}`,
      // "additional_params": {
      //   "timeout": "5",
      //   "cust": user_id,
      // }
    };

    const apiResult = await axios.post(
      "https://kpi.knowlarity.com/Basic/v1/account/call/makecall",
      requestBody,
      { headers }
    );

    const apiResponse = apiResult.data;

    is_call_placed = !Boolean(apiResponse.error);

    const [phone_call_details, phone_call_master_details] = await Promise.all([
      prisma.phone_call_rm.create({
        data: {
          batch_uuid: batch_uuid.length === 36 ? batch_uuid : uuidV4(),
          telephony_provider_id: 1,
          telephony_provider_call_id: is_call_placed
            ? apiResponse.success.call_id
            : null,
          agent_id,
          user_id: user?.user_id,
          agent_phone_number: rm_phone_number as string,
          user_phone_number: user_phone_number as string,
          call_type: CALL_TYPE.OUTBOUND,
          initiated_by: initiated_by,
          initiated_at: is_call_placed ? new Date() : undefined,
          is_error: !is_call_placed,
          is_fulfilled: false,
          telephony_provider_response: apiResponse,
          is_ongoing: is_call_placed,
        },
      }),
      prisma.phone_call_master.create({
        data: {
          telephony_provider_id: 1,
          telephony_provider_call_id: is_call_placed
            ? apiResponse.success.call_id
            : null,
          call_type: CALL_PAYMENT_TYPE.NON_PAID,
        },
      }),
    ]);

    if (!is_call_placed) {
      agentService.setOnCall(agent_id, false);
    }

    return {
      is_call_placed,
      call_id: phone_call_details.call_id,
      message: is_call_placed
        ? "Call placed successfully"
        : apiResponse.error.message,
    };
  } catch (error: any) {
    console.error(error);
    return createCallErrorResult(error.message);
  }
};
