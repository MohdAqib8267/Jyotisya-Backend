import { Request, Response } from "express";
import {
  agent_booking,
  AGENT_ROLE,
  BOOKING_STATUS,
  CALL_CATEGORY,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { sendErrorResponse } from "../../utils/http";
import { FeedbackOption, SelectedFeedbackOption } from "../../types";
import { extractAuthenticatedAgent } from "./agent.controller";
import { agentService, orderService } from "../../services/services.factory";

const prisma = new PrismaClient();

export const feedbackOptions = async (req: Request, res: Response) => {
  const booking_uuid = req.params.booking_uuid as unknown as string;
  const booking_details = await prisma.agent_booking.findUnique({
    where: {
      booking_uuid: booking_uuid,
    },
  });

  if (booking_details) {
    let call_category: CALL_CATEGORY = CALL_CATEGORY.FIRST_CALL;

    if (booking_details.is_extended) {
      call_category = CALL_CATEGORY.EXTENDED_CALL;
    } else if (booking_details.is_new_user === false) {
      call_category = CALL_CATEGORY.REPEAT_CALL;
    }

    try {
      const queryResult = (await prisma.$queryRaw`
      SELECT parent_option_id, parent_text, IF(child_array->>'$[0]' = 'null', JSON_ARRAY(), child_array) as child_array FROM
        (SELECT
          CASE WHEN parent_id > 0 THEN parent_id ELSE feedback_text_id END as parent_option_id,
          parent_text,
          JSON_ARRAYAGG(IF(child_text IS NOT NULL, JSON_OBJECT('child_option_id', feedback_text_id, 'child_text', child_text), null)) as child_array
        FROM
          (SELECT f.id,
                  agent_role,
                  t.sku_id,
                  call_category,
                  f.feedback_text_id,
                  parent_id,
                  t.type,
                  CASE
                      WHEN t2.title IS NULL THEN t.title
                      ELSE t2.title
                      END AS parent_text,
                  CASE
                      WHEN t2.title IS NOT NULL THEN t.title
                      ELSE t2.title
                      END AS child_text
          FROM feedback_options f
                    LEFT JOIN feedback_text t ON f.feedback_text_id = t.id
                    LEFT JOIN feedback_text t2 ON f.parent_id = t2.id
          WHERE agent_role = 'ASTRO'
            AND call_category = ${call_category}
          ) tmp
        GROUP BY 1, 2
        ORDER BY 1
        )
      tmp2
      `) as any;

      const feedback_options: FeedbackOption[] = queryResult.map((row: any) => {
        return {
          parent_option_id: Number(row.parent_option_id),
          parent_text: row.parent_text,
          child_array: row.child_array,
        };
      });

      const user_concern_list = await prisma.user_concern_category.findMany({
        select: {
          category_id: true,
          category_name: true,
          user_concern_list: {
            select: {
              concern_id: true,
              concern_name: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: "Feedback Options",
        data: { feedback_options, user_concern_list },
      });
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  } else {
    res.status(404).json({ success: false, message: "Booking Not Found" });
  }
};

export const saveFeedbackResponse = async (req: Request, res: Response) => {
  const agent = extractAuthenticatedAgent(req);

  if (!agent) {
    return sendErrorResponse(res, 401, "Unauthorized");
  }

  const booking_uuid = req.params.booking_uuid as unknown as string;
  const booking = await prisma.agent_booking.findUnique({
    where: {
      booking_uuid: booking_uuid,
    },
  });

  if (!booking) {
    return sendErrorResponse(res, 404, "Booking not found");
  }
  // if(!booking.is_extended) {
  //   await agentService.setAgentEarningHistory(agent.agent_id, booking.booking_id);
  // }
  const selected_feedback_options = req.body
    .selected_feedback_options as SelectedFeedbackOption[];
  const feedback_notes = req.body.feedback_notes
    ? req.body.feedback_notes
    : null;
  const user_concern_id_list: number[] | null = req.body.user_concern_id_list
    ? req.body.user_concern_id_list
    : null;

  let call_back_after_mins = 0;

  // Call Back Later
  if (
    selected_feedback_options &&
    selected_feedback_options[0].parent_option_id === 202 &&
    req.body.call_back_after_mins
  ) {
    call_back_after_mins = req.body.call_back_after_mins as number;
  }

  const user_id = booking.user_id;

  const user_concerns_data = user_concern_id_list
    ? user_concern_id_list.map((concern_id) => ({
        user_id: user_id,
        booking_id: booking.booking_id,
        concern_id: concern_id,
        agent_id: agent.agent_id,
        is_active: true,
      }))
    : [];

  try {
    // Loop through each feedback option selected by the user
    const feedback = await prisma.feedback_response.createMany({
      data: selected_feedback_options.map((option) => ({
        agent_id: agent.agent_id,
        booking_id: booking.booking_id,
        parent_option_id: option.parent_option_id,
        child_option_id: option.child_option_id,
      })),
    });

    await prisma.agent_booking_feedback.create({
      data: {
        booking_id: booking.booking_id,
        agent_id: agent.agent_id,
        agent_role: agent.role,
        selected_options: await orderService.getFeedbackOptionsText(
          selected_feedback_options
        ),
        agent_notes: feedback_notes,
        service_rating: req.body.service_rating ?? 0,
      },
    });

    if (user_concerns_data.length > 0) {
      await prisma.user_concerns.createMany({
        data: user_concerns_data,
      });
    }

    if (call_back_after_mins > 0) {
      await orderService.scheduleBooking(
        booking.booking_id,
        new Date(Date.now() + call_back_after_mins * 60 * 1000),
        true
      );
    } else {
      // Update the booking status to feedback submitted
      await prisma.agent_booking.update({
        where: {
          booking_id: booking.booking_id,
        },
        data: {
          booking_status:
            agent.role === AGENT_ROLE.ASTRO
              ? BOOKING_STATUS.AWAITING_USER_FEEDBACK_RM
              : BOOKING_STATUS.COMPLETED,
        },
      });
    }

    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (error) {
    console.error(error);
    sendErrorResponse(res, 500, "Error submitting feedback");
  }
};
