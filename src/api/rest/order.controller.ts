import { agent, CALLER_ROLE } from "@prisma/client";
import axios from "axios";
import { Request, Response } from "express";
import moment from "moment";
import { sendWASessionTextMessage } from "../../libs/wati/watiLib";
import {
  agentService,
  orderService,
  userService,
} from "../../services/services.factory";
import {
  CallResult,
  LambdaPaymentProxyPayload,
  ScheduleBookingPayload,
  SendPaymentLinkPayload,
} from "../../types";
import { sendErrorResponse } from "../../utils/http";
import { extractAuthenticatedAgent } from "./agent.controller";
import { v4 as uuidV4 } from "uuid";
import {
  makeNonPreBookingCall,
  makePreBookingCall,
} from "../../libs/knowlarity";

export const getExtendCallOptions = async (req: Request, res: Response) => {
  try {
    const extend_call_options = await orderService.getExtendCallSkuList();
    res.json({
      success: true,
      message: "Extend call options",
      data: {
        extend_call_options,
      },
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const processAllScheduledBookings = async (
  req: Request,
  res: Response
) => {
  try {
    await orderService.processAllScheduledBookings();
    res.json({ success: true, message: "All scheduled bookings processed" });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const processAllErroredBookings = async (
  req: Request,
  res: Response
) => {
  try {
    await orderService.scheduleAllErroredBookings();
    res.json({ success: true, message: "All errored bookings processed" });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const deferErroredCalls = async (req: Request, res: Response) => {
  try {
    await orderService.deferErroredCalls();
    res.json({ success: true, message: "All errored calls deferred" });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const getSKUList = async (req: Request, res: Response) => {
  try {
    const skuList = await orderService.getActiveSkuList();
    return res.json({
      success: true,
      message: "SKU List",
      data: {
        sku_list: skuList.map((sku) => ({
          sku_uuid: sku.sku_uuid,
          sku_price_inr: sku.sku_price_inr,
          sku_name: sku.sku_name,
          sku_duration_mins: sku.sku_duration_mins,
          sku_type: sku.sku_type,
          sku_category: sku.sku_category?.category_name,
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const getSKUCategoryListWithAgencyDefaultPerc = async (
  req: Request,
  res: Response
) => {
  try {
    const agency_id = req.query?.agency_id as string;
    const agency_default_earning_config = agency_id
      ? await agentService.getAgencyDefaultEarningConfig(parseInt(agency_id))
      : [];
    const skuCategoryList = await orderService.getSKUCategoryList();
    const data = {
      category_list: skuCategoryList.reduce((acc: object[], category: any) => {
        const config = agency_default_earning_config?.find(
          (conf: any) => conf.category_id === category.category_id
        );
        if (config) {
          acc.push({
            category_id: category.category_id,
            category_name: category.category_name,
            category_default_earning_perc:
              config.category_id === category.category_id
                ? config.agent_commission_percent
                : 0,
          });
        }

        return acc;
      }, []),
    };
    return res.json({
      success: true,
      message: "SKU Category List",
      data,
    });
  } catch (error) {
    return sendErrorResponse(res);
  }
};

export const sendPaymentLink = async (req: Request, res: Response) => {
  try {
    const payload: SendPaymentLinkPayload = req.body;
    const customer_name = payload.customer_name ?? "";
    const user = await userService.findOrCreateUser(
      payload.customer_phone,
      customer_name
    );

    const sku_uuid = payload.sku_uuid ? payload.sku_uuid : "";

    if (sku_uuid.length > 0) {
      const sku = await orderService.findSKUByUUID(sku_uuid);
      if (!sku) {
        return sendErrorResponse(res, 404, "SKU not found");
      }

      payload.sku_id = sku.sku_id;
    }

    let agent_id = 0;

    if (req.user) {
      const agent = extractAuthenticatedAgent(req);

      if (agent) {
        agent_id = agent.agent_id;
      }
    }

    const custom_price_inr = payload.custom_price_inr
      ? payload.custom_price_inr
      : 0;
    const paymentDetails = await orderService.createAndSendPaymentLink(
      user.user_id,
      payload.sku_id,
      0,
      agent_id,
      custom_price_inr
    );
    const new_order_id = paymentDetails.new_order_id;

    res.json(paymentDetails.api_response);
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const forceScheduleBooking = async (req: Request, res: Response) => {
  try {
    const payload: ScheduleBookingPayload = req.body;
    const user = await userService.findUserByPhone(payload.customer_phone);
    if (!user) {
      return sendErrorResponse(res, 404, "User not found");
    }

    const now = new Date();
    let minsToBookingStart = 0;

    // BOOK LATER
    if (payload.booking_start_hour >= 0) {
      const payloadTzDateTime = new Date(
        now.toLocaleString("en-US", { timeZone: payload.time_zone })
      );
      const payloadTzHours = payloadTzDateTime.getHours();
      const payloadTzMins = payloadTzDateTime.getMinutes();

      // Schedule for Today
      if (payloadTzHours < payload.booking_start_hour) {
        minsToBookingStart =
          (payload.booking_start_hour - payloadTzHours) * 60 - payloadTzMins;
      }
      // Schedule for Tomorrow
      else {
        const minsRemainingToday =
          24 * 60 - payloadTzHours * 60 - payloadTzMins;
        const minsAvailableTomorrow = payload.booking_start_hour * 60;
        minsToBookingStart = minsRemainingToday + minsAvailableTomorrow;
      }
    }

    const start_time = new Date(now.getTime() + minsToBookingStart * 60 * 1000);

    const pending_bookings = await orderService.getPendingBookingsForUser(
      user.user_id
    );

    if (pending_bookings.length > 0) {
      const booking_id = pending_bookings[0].booking_id;
      await orderService.scheduleBooking(booking_id, start_time, true);

      if (minsToBookingStart > 0) {
        const formattedDate = moment(start_time)
          .tz("Asia/Kolkata")
          .format("DD MMMM");
        const formattedTime = moment(start_time)
          .tz("Asia/Kolkata")
          .format("hh:mm A");
        const waMsgLines = [
          `✅ Congratulations. Booking scheduled for ${formattedDate} at ${formattedTime}.`,
          `✅ बधाई हो। आपकी बुकिंग ${formattedDate} को ${formattedTime} के लिए तय है ।`,
          ``,
          `📞You will receive a call from 8035468214 at the scheduled time.`,
          `📞आपको निर्धारित समय पर 8035468214 से कॉल प्राप्त होगा ।`,
          ``,
          `PLEASE SAVE THE NUMBER TO RECEIVE THE CALL.`,
          `कृपया कॉल प्राप्त करने के लिए नंबर सेव करें ।`,
        ];

        await sendWASessionTextMessage(user.user_id, waMsgLines.join("\n"));
      }
    }

    res.json({ success: true, message: "Booking scheduled" });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};
//schedule session
export const scheduleSession=async(req:Request,res:Response)=>{
  const booking_id=req.body.booking_id as unknown as number;
  const booking_start_time = req.body.onlyTime;
  const force_reschedule = req.body.checked;
  try {
    const schedule = await orderService.scheduleBooking(
      booking_id,
      booking_start_time,
      force_reschedule
    );

    if (schedule!== undefined) {
      res.json({
        success: true,
        message: "Session scheduled",
        data: {
          booking_id: booking_id,
          booking_start_time: booking_start_time,
          force_reschedule: force_reschedule
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
  } catch (error:any) {
    res.status(500).json({
      success: false,
      message: "Failed to schedule session",
      error: error.message
    });
  }
}

export const lambdaPaymentProxyHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const user = await userService.findOrCreateUser(
      req.query.customer_contact as string,
      req.query.customer_name as string
    );

    const amount_inr = parseInt(req.query.amount as string, 10);
    const matching_skus = await orderService.findSkuByPrice(amount_inr, 501);

    if (matching_skus.length === 0) {
      console.error("No Matching SKU Found for payment of INR " + amount_inr);
      return sendErrorResponse(res, 500, "No matching SKU found");
    }

    const sku_id = matching_skus[0].sku_id;

    const paymentDetails = await orderService.createAndSendPaymentLink(
      user.user_id,
      sku_id,
      0
    );
    res.json(paymentDetails.api_response);
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const extendBooking = async (req: Request, res: Response) => {
  try {
    const extension_sku_id = parseInt(req.body.extension_sku_id, 10);
    const custom_price_inr = parseInt(req.body.custom_price_inr, 10)
      ? parseInt(req.body.custom_price_inr, 10)
      : undefined;

    const booking_uuid = req.params.booking_uuid;
    const jwtAgent = extractAuthenticatedAgent(req);

    if (!jwtAgent) {
      return sendErrorResponse(res, 401, "Unauthorized");
    }

    const bookingExtension = await orderService.initiateExtendBooking(
      booking_uuid,
      extension_sku_id,
      jwtAgent.agent_id,
      custom_price_inr
    );

    if (!bookingExtension) {
      return sendErrorResponse(res, 500, "Unable to extend booking");
    }

    res.json({
      success: true,
      message: "Booking extension requested",
      data: {
        call_extension: {
          uuid: bookingExtension.extension_uuid,
          status: bookingExtension.extension_status,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};

export const placePhoneCall = async (req: Request, res: Response) => {
  try {
    const booking_uuid = req.params.booking_uuid;
    let phone_number = req.params.phone_number;
    const jwtAgent = extractAuthenticatedAgent(req);

    if (!jwtAgent) {
      return sendErrorResponse(res, 401, "Unauthorized");
    }

    let callDetails: CallResult | null = null;

    if (phone_number && !booking_uuid) {
      if (phone_number.startsWith("+")) {
        phone_number = phone_number.replace("+", "");
      }
      callDetails = await makeNonPreBookingCall(
        phone_number,
        jwtAgent.agent_id,
        uuidV4(),
        0,
        CALLER_ROLE.AGENT
      );
    } else if (booking_uuid && !phone_number) {
      const booking = await orderService.findBookingByUuid(booking_uuid);

      if (!booking) {
        return sendErrorResponse(res, 404, "Booking not found");
      }

      if (booking.astro_id && booking.astro_id !== jwtAgent.agent_id) {
        return sendErrorResponse(res, 403, "Forbidden");
      }

      callDetails = await makePreBookingCall(
        booking,
        jwtAgent.agent_id,
        uuidV4(),
        0,
        CALLER_ROLE.AGENT
      );
    }

    if (!callDetails) {
      return sendErrorResponse(res, 500, "Unable to place call");
    }

    if (!callDetails.is_call_placed) {
      console.log(callDetails);
      return sendErrorResponse(res, 500, "Unable to place call");
    }

    res.json({
      success: true,
      message: "Call placed",
      data: {
        call_details: callDetails,
      },
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};
