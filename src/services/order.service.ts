import prisma from "../data/index";
import {
  LambdaPaymentProxyPayload,
  MessagePayload,
  OrderServiceParams,
  PaymentLinkType,
  SelectedFeedbackOption,
  SkuWithCustomPricing,
} from "../types";
import { BaseService } from "./base.service";
import { _buildError, _logError } from "../utils/error";
import {
  agent_booking,
  agent_booking_extension,
  AGENT_ROLE,
  BOOKING_STATUS,
  BOOKING_TYPE,
  CALENDAR_STATUS,
  CONVERSATION_TYPE,
  EXTENSION_STATUS,
  ORDER_STATUS,
  PAYMENT_GATEWAY,
  PAYMENT_MODE,
  PAYMENT_STATUS,
  phone_call,
  Prisma,
  SKU_TYPE,
  user,
} from "@prisma/client";
import axios from "axios";
import { agentService, userService } from "./services.factory";
import {
  LEAD_ASSIGNEMENT_QUEUE,
  LEAD_EXCHANGE,
} from "../config/rabbitmq.config";
import { pushToQueue } from "../scripts/initializers/rabbitmq";
import { sendScheduleCallMessage } from "../libs/wati/watiLib";
import moment from "moment";
import { KUNDLI_SKU_ID } from "../constants";

export default class OrderService extends BaseService {
  private order_id = 0;

  constructor(params: OrderServiceParams) {
    super(params);
  }

  createOrder = async (
    user_id: number,
    sku_list: SkuWithCustomPricing[],
    parent_order_id: number = 0,
    created_by_agent_id: number = 0
  ) => {
    const draft_order = await this.createDraftOrder(
      user_id,
      parent_order_id,
      created_by_agent_id
    );

    let updated_order = draft_order;

    for (const sku of sku_list) {
      updated_order = await this.addLineItem(
        draft_order.order_id,
        sku.sku_id,
        sku.sku_qty,
        sku.custom_price_inr
      );
    }

    return updated_order;
  };

  createDraftOrder = async (
    user_id: number,
    parent_order_id: number = 0,
    created_by_agent_id: number = 0
  ) => {
    return await prisma.order.create({
      data: {
        user_id,
        parent_order_id,
        line_item_count: 0,
        tax_amount_inr: 0,
        total_amount_inr: 0,
        created_by_agent_id,

        payment_type: PAYMENT_MODE.ONLINE,
        payment_status: PAYMENT_STATUS.PENDING,
        order_status: ORDER_STATUS.DRAFT,
      },
    });
  };

  addLineItem = async (
    order_id: number,
    sku_id: number,
    sku_qty: number,
    custom_price_inr: number | undefined = undefined
  ) => {
    const order = await prisma.order.findUnique({
      where: {
        order_id,
      },
    });

    if (!order) {
      throw _buildError(
        this._logger,
        "Orders::addLineItem",
        "ORDER_NOT_FOUND",
        {}
      );
    }

    if (order.order_status != ORDER_STATUS.DRAFT) {
      throw _buildError(
        this._logger,
        "Orders::addLineItem",
        "ORDER_NOT_DRAFT",
        {}
      );
    }

    const sku = await prisma.sku.findUnique({
      where: {
        sku_id,
      },
    });

    if (!sku) {
      throw _buildError(
        this._logger,
        "Orders::addLineItem",
        "SKU_NOT_FOUND",
        {}
      );
    }

    const final_sku_price = custom_price_inr || sku.sku_price_inr; // Handles cases where custom price is zero

    await prisma.order_line_item.create({
      data: {
        order_id,
        sku_id,
        line_item_quantity: sku_qty,
        sku_price_inr: final_sku_price,
        line_item_total_amount_inr: final_sku_price * sku_qty,
        line_item_commission_inr: sku.sku_commission_inr * sku_qty,
      },
    });

    const line_item_count = await prisma.order_line_item.count({
      where: {
        order_id,
      },
    });

    const total_amount_inr = await prisma.order_line_item.aggregate({
      _sum: {
        line_item_total_amount_inr: true,
      },
      where: {
        order_id,
      },
    });

    const updated_order = await prisma.order.update({
      where: {
        order_id,
      },
      data: {
        line_item_count,
        total_amount_inr: total_amount_inr._sum
          .line_item_total_amount_inr as unknown as number,
      },
    });

    return updated_order;
  };

  findSKUByUUID = async (sku_uuid: string) => {
    return await prisma.sku.findUnique({
      where: {
        sku_uuid,
      },
    });
  };

  findSkuByPrice = async (sku_price_inr: number, category_id = 501) => {
    return await prisma.sku.findMany({
      where: {
        category_id,
        sku_price_inr,
        is_active: true,
      },
    });
  };

  getActiveSkuList = async () => {
    return await prisma.sku.findMany({
      where: {
        is_active: true,
      },
      include: {
        sku_category: {
          select: {
            category_name: true,
          },
        },
      },
    });
  };

  getSKUCategoryList() {
    return prisma.sku_category.findMany({});
  }

  getSKUListByCategory = async (category_id: number) => {
    return await prisma.sku.findMany({
      where: {
        category_id,
        is_active: true,
      },
    });
  };

  savePaymentLink = async (
    order_id: number,
    amount_inr: number,
    link_id_3p: string,
    link_qr_id_3p: string,
    link_url: string,
    link_qr_url_3p: string,
    link_qr_url_custom: string,
    notes: any,
    payment_gateway = PAYMENT_GATEWAY.RAZORPAY
  ) => {
    const order = await prisma.order.findUnique({
      where: {
        order_id,
      },
    });

    if (!order) {
      throw _buildError(
        this._logger,
        "Orders::getPaymentLink",
        "ORDER_NOT_FOUND",
        {}
      );
    }

    if (order.payment_status == PAYMENT_STATUS.PAID) {
      throw _buildError(
        this._logger,
        "Orders::getPaymentLink",
        "ORDER_ALREADY_PAID",
        {}
      );
    }

    const payment_link = await prisma.payment_link.create({
      data: {
        user_id: order.user_id,
        order_id,
        payment_gateway,
        payment_amount_inr: amount_inr,
        link_id_3p,
        link_qr_id_3p,
        link_url,
        link_qr_url_3p,
        link_qr_url_custom,
        expiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        notes,
        payment_status: PAYMENT_STATUS.PENDING,
      },
    });

    await prisma.order.update({
      where: {
        order_id,
      },
      data: {
        order_status: ORDER_STATUS.AWAITING_PAYMENT,
        payment_status: PAYMENT_STATUS.PENDING,
      },
    });

    return payment_link;
  };

  markPaymentLinkPaid = async (
    link_type: PaymentLinkType,
    link_id_3p: string,
    payment_gateway = PAYMENT_GATEWAY.RAZORPAY
  ) => {
    try {
      let existing_link;
      if (link_type == PaymentLinkType.PAYMENT_LINK) {
        existing_link = await prisma.payment_link.findUnique({
          where: {
            link_id_3p_unique: {
              payment_gateway,
              link_id_3p,
            },
          },
        });
      } else if (link_type == PaymentLinkType.QR_CODE) {
        existing_link = await prisma.payment_link.findUnique({
          where: {
            link_qr_id_3p_unique: {
              payment_gateway,
              link_qr_id_3p: link_id_3p,
            },
          },
        });
      }

      if (
        existing_link &&
        existing_link.payment_status !== PAYMENT_STATUS.PAID
      ) {
        const updated_link = await prisma.payment_link.update({
          where: {
            payment_link_id: existing_link.payment_link_id,
          },
          data: {
            payment_status: PAYMENT_STATUS.PAID,
          },
        });

        if (updated_link) {
          await this.markOrderPaid(
            updated_link.order_id,
            updated_link.payment_link_id
          );
        }
      }
      return true;
    } catch (err) {
      console.error(
        "V1 Flow: PAYMENT_DONE: PAYMENT_LINK_NOT_FOUND",
        link_id_3p
      );
      return false;
    }
  };

  markOrderPaid = async (order_id: number, payment_link_id: number) => {
    const updated_order = await prisma.order.update({
      where: {
        order_id,
      },
      data: {
        payment_status: PAYMENT_STATUS.PAID,
        order_status: ORDER_STATUS.ORDERED,
      },
    });

    const order_line_items = await prisma.order_line_item.findMany({
      where: {
        order_id,
      },
    });

    for (const line_item of order_line_items) {
      const sku = await prisma.sku.findUnique({
        where: {
          sku_id: line_item.sku_id,
        },
      });

      if (!sku) {
        console.error("PAYMENT_DONE: SKU_NOT_FOUND", payment_link_id);
        return false;
      }

      if (sku && sku.sku_type === SKU_TYPE.CONSULTANCY) {
        const booking_type: BOOKING_TYPE =
          sku.category_id === 501
            ? BOOKING_TYPE.BOOK_NOW
            : BOOKING_TYPE.BOOK_LATER;
        if (sku.sku_id === 21) {
          const user_id = updated_order.user_id;
          await prisma.user_kundli.update({
            where: {
              user_id: user_id,
            },
            data: {
              user_kundli_buy_at: moment().toDate(),
              kundli_pdf_buy_status: true,
            },
          });
          return;
        }
        await this.createBooking(
          order_id,
          payment_link_id,
          sku.sku_id,
          booking_type,
          sku.sku_duration_mins
        );
      }
    }

    await this.fulfillPendingBookings(updated_order.user_id);
  };

  getSkuDetails = async (sku_id: number) => {
    return await prisma.sku.findUnique({
      where: {
        sku_id,
      },
    });
  };

  getExtendCallSkuList = async () => {
    return await prisma.sku.findMany({
      where: {
        category_id: 501,
        is_allowed_as_extension: true,
        is_active: true,
      },
      orderBy: {
        sku_rank: "asc",
      },
    });
  };

  // TODO: Accept Sku ID List in params instead of amount_inr
  createAndSendPaymentLink = async (
    user_id: number,
    sku_id: number,
    parent_order_id: number = 0,
    created_by_agent_id: number = 0,
    custom_price_inr: number | undefined = undefined,
    payment_gateway = PAYMENT_GATEWAY.RAZORPAY,
    skip_wati_message = false,
  ) => {
    let apiResponse: any;
    let new_order_id: number = 0;

    const sku_details = await this.getSkuDetails(sku_id);

    if (!sku_details) {
      throw _buildError(
        this._logger,
        "Orders::createAndSendPaymentLink",
        "SKU_NOT_FOUND",
        { sku_id }
      );
    }

    const amount_inr = custom_price_inr || sku_details.sku_price_inr;

    const user = await prisma.user.findUnique({
      where: {
        user_id,
      },
    });

    if (!user) {
      throw _buildError(
        this._logger,
        "Orders::createAndSendPaymentLink",
        "USER_NOT_FOUND",
        { user }
      );
    }

    if (payment_gateway === PAYMENT_GATEWAY.RAZORPAY) {
      const queryPayload: LambdaPaymentProxyPayload = {
        amount: `${amount_inr}`,
        name: `${amount_inr} Rs Payment`,
        customer_contact: user.phone_number,
        customer_email: "",
        customer_name: user.user_name,
        customer_id: user.phone_number,
        description: `Payment for ${sku_details.sku_duration_mins} mins Session`,
        skip_wati_message: skip_wati_message,
      };

      const paymentsLambdaResponse = await axios.request({
        method: "POST",
        url: "https://5h9c2vrsih.execute-api.ap-south-1.amazonaws.com/production/api/getPaymentLinks",
        headers: {
          Authorization: "Bearer 1DM9TCsGokR3ZX0kCq4b1aQAstro0C2BtlCbQ4lrjJ",
        },
        params: queryPayload as any,
      });

      apiResponse = paymentsLambdaResponse.data;

      try {
        const link_url = apiResponse.data.payment_link.short_url;
        const link_qr_id_3p = apiResponse.data.payment_link_qr.id;
        const link_qr_url_3p = apiResponse.data.payment_link_qr.image_url;
        const link_qr_url_custom =
          apiResponse.data.payment_link_qr.image_url_custom;

        const phone_number = apiResponse.data.payment_link.notes.contact;
        const user_name = apiResponse.data.payment_link.notes.name;

        const user = await userService.findOrCreateUser(
          phone_number,
          user_name
        );

        const payment_link_amount =
          parseInt(apiResponse.data.payment_link.amount) / 100;

        const link_id_3p = apiResponse.data.payment_link.id;
        const notes = apiResponse.data.payment_link.notes;

        // TODO: Add order_id, payment_link_id to notes within lambda
        const new_order = await this.createOrder(
          user.user_id,
          [{ sku_id: sku_id, sku_qty: 1, custom_price_inr }],
          parent_order_id,
          created_by_agent_id
        );
        await this.savePaymentLink(
          new_order.order_id,
          payment_link_amount,
          link_id_3p,
          link_qr_id_3p,
          link_url,
          link_qr_url_3p,
          link_qr_url_custom,
          notes
        );
        new_order_id = new_order.order_id;
      } catch (err) {
        console.error(err);
      }
    }

    return {
      api_response: apiResponse,
      new_order_id,
    };
  };

  findBookingByUuid = async (booking_uuid: string) => {
    return await prisma.agent_booking.findUnique({
      where: {
        booking_uuid,
      },
    });
  };

  initiateExtendBooking = async (
    booking_uuid: string,
    extension_sku_id: number,
    agent_id: number,
    custom_price_inr: number | undefined = undefined
  ): Promise<agent_booking_extension | null> => {
    const booking = await this.findBookingByUuid(booking_uuid);

    if (!booking) {
      throw _buildError(
        this._logger,
        "Orders::initiateExtendBooking",
        "BOOKING_NOT_FOUND",
        { booking_uuid }
      );
    }

    const booking_id = booking.booking_id;

    const ongoingCall = await this.getLiveCallForBooking(booking_id);

    if (ongoingCall) {
      const paymentDetails = await this.createAndSendPaymentLink(
        booking.user_id,
        extension_sku_id,
        booking.order_id,
        agent_id,
        custom_price_inr
      );
      const child_order_id = paymentDetails.new_order_id;

      const extension = await prisma.agent_booking_extension.create({
        data: {
          parent_order_id: booking.order_id,
          parent_booking_id: booking.booking_id,
          call_id: ongoingCall ? ongoingCall.call_id : 0,
          extended_by_agent_id: agent_id,
          extension_sku_id,
          child_order_id,
          child_booking_id: 0,
        },
      });

      return extension;
    } else {
      throw _buildError(
        this._logger,
        "Orders::initiateExtendBooking",
        "BOOKING_CLOSED",
        { booking_uuid }
      );
    }
  };

  getPaidOrdersCount = async (user_id: number): Promise<number> => {
    return await prisma.order.count({
      where: {
        user_id,
        payment_status: PAYMENT_STATUS.PAID,
      },
    });
  };

  getLiveCallForBooking = async (
    booking_id: number
  ): Promise<phone_call | null> => {
    return await prisma.phone_call.findFirst({
      where: {
        booking_id: booking_id,
        is_ongoing: true,
      },
      orderBy: {
        call_id: "desc",
      },
    });
  };

  getLiveCallExtensions = async (
    call_id: number
  ): Promise<Array<agent_booking_extension>> => {
    return await prisma.agent_booking_extension.findMany({
      where: {
        call_id,
      },
      orderBy: {
        extension_id: "desc",
      },
    });
  };

  getLastCallForBooking = async (
    booking_id: number
  ): Promise<phone_call | null> => {
    return await prisma.phone_call.findFirst({
      where: {
        booking_id: booking_id,
      },
      orderBy: {
        call_id: "desc",
      },
    });
  };

  createBooking = async (
    order_id: number,
    payment_link_id: number,
    sku_id: number,
    booking_type: BOOKING_TYPE,
    booking_duration_mins: number
  ) => {
    const order = await prisma.order.findUnique({
      where: {
        order_id,
      },
    });

    let booking_status: BOOKING_STATUS = BOOKING_STATUS.AWAITING_SCHEDULE;
    let astro_id = 0;
    let parent_order_id = 0;
    let parent_booking_id = 0;
    let booking_start_time = null;
    let booking_end_time = null;
    let call_info: phone_call | null = null;

    // TODO: Split extend call into separate function
    /* EXTEND BOOKING */
    // If this order was an extension, then we need to extend the parent booking
    if (order && order.parent_order_id) {
      const parent_booking = await prisma.agent_booking.findFirst({
        where: {
          order_id: order.parent_order_id,
        },
      });

      if (
        parent_booking &&
        parent_booking.booking_status === BOOKING_STATUS.CALL_IN_PROGRESS
      ) {
        // Double confirmation that the call is in progress
        call_info = await this.getLiveCallForBooking(parent_booking.booking_id);

        if (call_info) {
          parent_order_id = order.parent_order_id;
          parent_booking_id = parent_booking.booking_id;
          booking_type = BOOKING_TYPE.EXTEND_CALL;
          // Booking starts when the parent booking ends
          if (parent_booking.booking_end_time) {
            booking_start_time = parent_booking.booking_end_time;
            booking_end_time = new Date(
              booking_start_time.getTime() + booking_duration_mins * 60 * 1000
            );
          }

          astro_id = parent_booking.astro_id;
          // Set the current booking status to completed
          booking_status = BOOKING_STATUS.COMPLETED;
        }
      }
    }
    /* END EXTEND BOOKING */

    const now = new Date();

    if (
      booking_type === BOOKING_TYPE.BOOK_NOW &&
      booking_status !== BOOKING_STATUS.AWAITING_SCHEDULE
    ) {
      booking_start_time = now;
      booking_end_time = new Date(
        booking_start_time.getTime() + booking_duration_mins * 60 * 1000
      );
    }

    if (!order) {
      throw new Error("Order not found");
    }

    const is_new_user = (await this.getPaidOrdersCount(order.user_id)) === 1;
    const sticky_astro = await userService.getStickyAgent(
      order.user_id,
      AGENT_ROLE.ASTRO
    );

    if (!astro_id) {
      astro_id = sticky_astro ? sticky_astro.agent_id : 0;
    }
    const is_sticky_agent = Boolean(sticky_astro);

    const new_booking = await prisma.agent_booking.create({
      data: {
        order_id: order_id,
        parent_booking_id,
        sku_id,
        payment_link_id,
        user_id: order.user_id,
        astro_id: astro_id,
        booking_start_time: booking_start_time,
        booking_end_time: booking_end_time,
        booking_duration_mins,
        booking_status,
        booking_type,
        is_new_user: is_new_user,
        is_sticky_agent: is_sticky_agent,
        conversation_type: CONVERSATION_TYPE.CALL,
        calendar_status: CALENDAR_STATUS.BUSY,
        is_pushed_to_queue: false,
      },
    });

    // If order was created manually by an agent, send a message to the user asking to select a time
    if (
      order.created_by_agent_id > 0 &&
      booking_status === BOOKING_STATUS.AWAITING_SCHEDULE
    ) {
      await sendScheduleCallMessage(order.user_id);
    }

    if (parent_order_id && parent_booking_id && order_id) {
      if (call_info) {
        await prisma.phone_call.update({
          where: {
            call_id: call_info.call_id,
          },
          data: {
            call_duration_ideal: {
              increment: booking_duration_mins * 60,
            },
          },
        });
      }

      await prisma.agent_booking_extension.updateMany({
        where: {
          parent_order_id,
          parent_booking_id,
          child_order_id: order_id,
        },
        data: {
          child_booking_id: new_booking.booking_id,
          extension_status: EXTENSION_STATUS.COMPLETED,
        },
      });
    }

    // Don't Set TAT for Extend Call Bookings
    if (booking_type !== BOOKING_TYPE.EXTEND_CALL) {
      await prisma.agent_booking_tat.create({
        data: {
          booking_id: new_booking.booking_id,
          paid_at: new Date(),
        },
      });
    }

    return new_booking;
  };

  scheduleBooking = async (
    booking_id: number,
    booking_start_time: Date,
    force_reschedule: boolean = false
  ) => {
    const booking = await prisma.agent_booking.findUnique({
      where: {
        booking_id,
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (
      !force_reschedule &&
      booking.booking_status !== BOOKING_STATUS.AWAITING_SCHEDULE
    ) {
      throw new Error("Booking is not awaiting schedule");
    }

    await prisma.agent_booking.update({
      where: {
        booking_id,
      },
      data: {
        booking_start_time,
        show_on_astro_calendar: true,
        booking_end_time: new Date(
          booking_start_time.getTime() +
            booking.booking_duration_mins * 60 * 1000
        ),
        booking_status: BOOKING_STATUS.SCHEDULED,
        is_pushed_to_queue: false,
        booking_retry_count: {
          increment: 1,
        },
      },
    });

    // Immediately push to queue if booking time is in the past
    if (booking_start_time < new Date()) {
      await this.pushBookingToQueue(booking_id);
    }

    await this.updateBookingTAT(booking_id, "last_scheduled_at");
    await this.updateBookingTAT(
      booking_id,
      "last_scheduled_for",
      booking_start_time
    );
  };

  rescheduleBooking = async (
    booking_id: number,
    booking_start_time: Date | undefined = undefined
  ) => {
    if (!booking_start_time) {
      booking_start_time = new Date(Date.now() + 1 * 60 * 1000);
    }

    const booking = await prisma.agent_booking.findUnique({
      where: {
        booking_id,
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    await this.scheduleBooking(booking_id, booking_start_time, true);
  };

  getUserBookingsWithStatus = async (
    user_id: number,
    allowed_booking_status: BOOKING_STATUS[],
    is_pushed_to_queue: boolean = false
  ) => {
    return await prisma.agent_booking.findMany({
      where: {
        user_id,
        booking_status: {
          in: allowed_booking_status,
        },
        is_pushed_to_queue,
      },
    });
  };

  updateManyBookingStatus = async (
    booking_ids: number[],
    booking_status: BOOKING_STATUS,
    is_pushed_to_queue: boolean | undefined = undefined
  ) => {
    return await prisma.agent_booking.updateMany({
      where: {
        booking_id: {
          in: booking_ids,
        },
      },
      data: {
        booking_status,
        is_pushed_to_queue,
      },
    });
  };

  processDraftBookings = async (user_id: number) => {
    const draft_bookings = await this.getUserBookingsWithStatus(user_id, [
      BOOKING_STATUS.DRAFT,
      BOOKING_STATUS.AWAITING_USER_BIRTH_DETAILS,
    ]);

    const userHasBirthDetails = await userService.hasBirthDetails(user_id);

    let booking_status: BOOKING_STATUS =
      BOOKING_STATUS.AWAITING_USER_BIRTH_DETAILS;

    if (userHasBirthDetails) {
      booking_status = BOOKING_STATUS.AWAITING_SCHEDULE;
    }

    const draft_booking_ids = draft_bookings.map(
      (booking) => booking.booking_id
    );

    if (draft_booking_ids.length) {
      await this.updateManyBookingStatus(draft_booking_ids, booking_status);
    }
  };

  processAwaitingScheduleBookings = async (user_id: number) => {
    const awaiting_schedule_bookings = await this.getUserBookingsWithStatus(
      user_id,
      [BOOKING_STATUS.AWAITING_SCHEDULE]
    );

    for (const booking of awaiting_schedule_bookings) {
      if (booking.booking_type === BOOKING_TYPE.BOOK_NOW) {
        await this.scheduleBooking(booking.booking_id, new Date());
      }
    }
  };

  processAllAwaitingScheduleBookings = async () => {
    const waiting_schedule_bookings = await prisma.agent_booking.findMany({
      where: {
        booking_status: BOOKING_STATUS.AWAITING_SCHEDULE,
        AND: [
          {
            created_at: { lt: moment().subtract(1, "hour").toDate() },
          },
          {
            created_at: { gt: moment().startOf("day").toDate() },
          },
        ],
      },
    });
    for (const booking of waiting_schedule_bookings) {
      try {
        await this.processAwaitingScheduleBookings(booking.user_id);
      } catch (err: any) {
        this._logger.error({
          stage: "FORCED_MOVEMENT FROM AWAITING_SCHEDULE",
          error: err,
          stack: err?.stack,
          data: {
            user_id: booking.user_id,
          },
        });
      }
    }
  };

  sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  deferErroredCalls = async () => {
    // Calls where initiated_at < now() - 1 minute and agent_answered_at is null are false positives
    const errored_calls = await prisma.phone_call.findMany({
      where: {
        is_ongoing: true,
        initiated_at: {
          lt: new Date(Date.now() - 7 * 60 * 1000),
        },
        // Sometimes, the AGENT_CALL event comes before the API Call response
        agent_called_at: null,
        agent_answered_at: null,
        user_called_at: null,
        user_answered_at: null,
      },
    });

    for (const call of errored_calls) {
      // Check such call count for the same booking with the same number
      const errored_call_count_for_booking = await prisma.phone_call.count({
        where: {
          booking_id: call.booking_id,
          user_phone_number: call.user_phone_number,
          initiated_at: {
            lt: new Date(Date.now() - 1 * 60 * 1000),
          },
          agent_called_at: null,
          agent_answered_at: null,
          user_called_at: null,
          user_answered_at: null,
        },
      });

      if (errored_call_count_for_booking < 3) {
        await this.scheduleBooking(
          call.booking_id,
          new Date(Date.now() + 5 * 60 * 1000),
          true
        );
      } else {
        await this.updateManyBookingStatus(
          [call.booking_id],
          BOOKING_STATUS.DEFERRED
        );
        // Send Message Asking for a new calling number
        // On calling number update, change booking status
      }

      await prisma.phone_call.update({
        where: {
          call_id: call.call_id,
        },
        data: {
          is_ongoing: false,
        },
      });

      await agentService.setOnCall(call.agent_id, false);
    }
  };

  scheduleAllErroredBookings = async () => {
    const updateResult = (await prisma.$queryRaw`
      UPDATE agent_booking
      SET
        booking_status = ${BOOKING_STATUS.SCHEDULED},
        pushed_to_queue = 0
      WHERE booking_status = 'CALL_ERROR'
      AND booking_id IN (
        SELECT booking_id
        FROM phone_call
        WHERE telephony_provider_call_id IS NULL
        AND LOWER(telephony_provider_response) NOT LIKE '%do not call%'
      )
    `) as any;

    this.processAllScheduledBookings();
  };

  processAllScheduledBookings = async () => {
    const scheduled_bookings = await prisma.agent_booking.findMany({
      where: {
        booking_status: BOOKING_STATUS.SCHEDULED,
        is_pushed_to_queue: false,
        booking_start_time: {
          not: null,
          lt: new Date(Date.now() - 5 * 1000),
        },
      },
      orderBy: {
        is_sticky_agent: "desc",
      },
    });

    for (const booking of scheduled_bookings) {
      await this.pushBookingToQueue(booking.booking_id);
      // TODO: Delay via x-delay header => i * 100
      await this.sleep(50);
    }
  };

  processScheduledBookingsForUser = async (user_id: number) => {
    const scheduled_bookings = await this.getUserBookingsWithStatus(user_id, [
      BOOKING_STATUS.SCHEDULED,
    ]);
    for (const booking of scheduled_bookings) {
      if (
        booking.booking_start_time &&
        booking.booking_start_time <= new Date()
      ) {
        await this.pushBookingToQueue(booking.booking_id);
      }
    }
  };

  getPendingBookingsForUser = async (user_id: number) => {
    return await this.getUserBookingsWithStatus(user_id, [
      BOOKING_STATUS.DRAFT,
      BOOKING_STATUS.AWAITING_USER_BIRTH_DETAILS,
      BOOKING_STATUS.AWAITING_SCHEDULE,
      BOOKING_STATUS.AWAITING_SCHEDULE_RM,
      BOOKING_STATUS.DEFERRED,
    ]);
  };

  fulfillPendingBookings = async (user_id: number): Promise<boolean> => {
    return true;
    // DRAFT => (AWAITING_USER_BIRTH_DETAILS =>) AWAITING_SCHEDULE => SCHEDULED => AWAITING_CALL => CALL_IN_PROGRESS (=> CALL_ERROR) => COMPLETED
    //                                                                    ⇑                               ⇓                   ⇓
    //                                                                    ⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐⇐

    // DRAFT => (AWAITING_USER_BIRTH_DETAILS =>) AWAITING_SCHEDULE
    await this.processDraftBookings(user_id);

    // AWAITING_SCHEDULE => SCHEDULED
    await this.processAwaitingScheduleBookings(user_id);

    // SCHEDULED => AWAITING_CALL // Also Pushes eligible bookings to the queue
    await this.processScheduledBookingsForUser(user_id);

    return true;
  };

  pushBookingToQueue = async (
    booking_id: number,
    batch_uuid: string = "",
    call_retry_count: number = 0,
    force_push = false
  ) => {
    const booking = await prisma.agent_booking.findUnique({
      where: {
        booking_id,
      },
    });

    if (!booking) {
      console.error("Booking not found");
      return;
    }

    if (!force_push) {
      if (booking.is_pushed_to_queue) {
        console.error("Booking already in queue");
        return;
      }

      if (booking.booking_status !== BOOKING_STATUS.SCHEDULED) {
        console.error("Booking not in Scheduled state");
        return;
      }
    }

    await this.updateManyBookingStatus(
      [booking.booking_id],
      BOOKING_STATUS.AWAITING_CALL
    );

    const messsagePayload: MessagePayload = {
      message_version: 2,
      data: {
        booking_uuid: booking.booking_uuid,
        is_sticky_agent: booking.is_sticky_agent,
        booked_at: booking.created_at.toISOString(),
        pushed_at: new Date().toISOString(),
        metadata: {
          batch_uuid,
          call_retry_count,
          booking_retry_count: booking.booking_retry_count,
        },
      },
    };

    this._logger.info({
      stage: "Fetching booking id",
      info: booking.booking_uuid,
      data: messsagePayload,
    });

    // Push Booking to queue
    const isPushSuccessful = await pushToQueue(
      LEAD_EXCHANGE,
      LEAD_ASSIGNEMENT_QUEUE,
      JSON.stringify(messsagePayload)
    );

    if (isPushSuccessful) {
      await prisma.agent_booking.update({
        where: {
          booking_id: booking.booking_id,
        },
        data: {
          is_pushed_to_queue: true,
        },
      });
    }
  };

  getFeedbackOptionsText = async (
    selectedFeedbackOptions: SelectedFeedbackOption[]
  ) => {
    const feedbackTextList = await prisma.feedback_text.findMany();

    const feedbackOptionsText = {} as any;

    for (const selectedFeedbackOption of selectedFeedbackOptions) {
      const parentFeedbackOption = feedbackTextList.find(
        (option) => option.id === selectedFeedbackOption.parent_option_id
      );
      if (parentFeedbackOption) {
        if (!feedbackOptionsText[parentFeedbackOption.title]) {
          feedbackOptionsText[parentFeedbackOption.title] = [];
        }

        const childFeedbackOption = feedbackTextList.find(
          (option) => option.id === selectedFeedbackOption.child_option_id
        );
        if (childFeedbackOption) {
          feedbackOptionsText[parentFeedbackOption.title].push(
            childFeedbackOption.title
          );
        }
      }
    }

    return feedbackOptionsText;
  };

  updateBookingTAT = async (
    booking_id: number,
    field: keyof Prisma.agent_booking_tatUpdateInput,
    date: Date = new Date()
  ) => {
    const existing_booking_tat = await prisma.agent_booking_tat.findUnique({
      where: {
        booking_id,
      },
    });

    if (existing_booking_tat) {
      const updateFields: Prisma.agent_booking_tatUpdateInput = {
        [field]: date,
      };

      if (
        field == "last_scheduled_at" &&
        !existing_booking_tat.first_scheduled_at
      ) {
        updateFields["first_scheduled_at"] = date;
      }

      if (
        field == "last_scheduled_for" &&
        !existing_booking_tat.first_scheduled_for
      ) {
        updateFields["first_scheduled_for"] = date;
      }

      if (
        field == "last_call_attempted_at" &&
        !existing_booking_tat.first_call_attempted_at
      ) {
        updateFields["first_call_attempted_at"] = date;
      }

      await prisma.agent_booking_tat.update({
        where: {
          booking_id,
        },
        data: updateFields,
      });
    }
  };

  updateBookingTATMultiField = async (
    booking_id: number,
    updateFields: Prisma.agent_booking_tatUpdateInput
  ) => {
    const existing_booking_tat = await prisma.agent_booking_tat.findUnique({
      where: {
        booking_id,
      },
    });

    if (existing_booking_tat) {
      await prisma.agent_booking_tat.update({
        where: {
          booking_id: existing_booking_tat.booking_id,
        },
        data: updateFields,
      });
    }
  };

  findKundliOrderPaymentLink = async (user_id: number) => {
    const result = (await prisma.$queryRaw`
      SELECT pl.link_url, o.user_id, pl.payment_status FROM \`order\` o 
      LEFT JOIN order_line_item oi ON o.order_id = oi.order_id
      LEFT JOIN payment_link pl ON o.order_id = pl.order_id
      WHERE o.user_id = ${user_id}
      AND oi.sku_id = ${KUNDLI_SKU_ID}
      ORDER BY pl.created_at DESC
    `) as any[];
    const paid_link = result.find(
      (r: any) => r.payment_status === PAYMENT_STATUS.PAID
    );
    if (paid_link) {
      throw _buildError(
        this._logger,
        "Orders::findKundliOrderPaymentLink",
        "KUNDLI_ALREADY_PURCHASED",
        {}
      );
    }
    return result.length ? result[0].link_url : null;
  };

  /* createPaymentLink = async (order_id: number, payload: any, payment_gateway = PAYMENT_GATEWAY.RAZORPAY) => {
    const order = await prisma.order.findUnique({
      where: {
        order_id,
      }
    });

    if (!order) {
      throw _buildError(this._logger, "Orders::getPaymentLink", "ORDER_NOT_FOUND", {});
    }

    if (order.payment_status == PAYMENT_STATUS.PAID) {
      throw _buildError(this._logger, "Orders::getPaymentLink", "ORDER_NOT_FOUND", {});
    }

    let url = "";
    await axios.get("")

    const payment_link = await prisma.payment_link.create({
      data: {
        user_id: order.user_id,
        order_id,
        payment_gateway,
        payment_amount_inr: order.total_amount_inr,
        expiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        payload,
        payment_status: PAYMENT_STATUS.PENDING,
        url: "",
        qr_url: "",
      }
    });

    return payment_link;
  } */
}
