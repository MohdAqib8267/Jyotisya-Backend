import { Request, response, Response } from "express";
import { AGENT_ROLE, Prisma } from "@prisma/client";
import {
  agentService,
  orderService,
  userService,
  watiService,
} from "../../services/services.factory";
import { sendErrorResponse } from "../../utils/http";
import { BirthDetails } from "../../types";
import { extractAuthenticatedAgent } from "./agent.controller";

export const addUser = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const user = await userService.findOrCreateUser(
      data.phone_number,
      data.user_name,
      data.birth_details
    );
    return res.status(200).json({
      message: "user successfully created",
      user_info: {
        user_uuid: user.user_uuid,
        user_name: user.user_name,
      },
    });
  } catch (error: any) {
    return res.status(500).send("failed to add agent");
  }
};

export const searchUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  // const phoneNumber = req.query.phone_number as unknown as string;
  const user_id = req.query.user_id as unknown as number;


  // const user = await userService.findUserByPhone(phoneNumber);
  const user = await userService.findUserById(user_id);

  if (user) {
    const sticky_agent_info = await userService.getStickyAgent(
      user.user_id,
      AGENT_ROLE.ASTRO
    );
    let sticky_agent;

    if (sticky_agent_info) {
      const agent_info = await agentService.getAgentById(
        sticky_agent_info.agent_id
      );
      sticky_agent = {
        agent_id: sticky_agent_info.agent_id,
        agent_name: agent_info ? agent_info.agent_name : undefined,
      };
    }

    res.json({
      success: true,
      message: "User found",
      data: {
        user: {
          user_uuid: user.user_uuid,
          user_name: user.user_name,
          phone_number: user.phone_number,
          calling_number: user.calling_number,
          sticky_agent: sticky_agent,
        },
      },
    });
  } else {
    res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
};

export const updateAgentForUser = async (req: Request, res: Response): Promise<void> => {
  const user_id = req.query.user_id as unknown as number;
  const astro_id = req.query.changeAstrologerId as unknown as number;

  const user = await userService.findUserById(user_id);

  if (user) {
    const existingMapping = await userService.getStickyAgent(user.user_id, AGENT_ROLE.ASTRO);

    let sticky_agent;
    if (existingMapping !== null) {

      const updatedAgent = await userService.updateStickyAgent(
        existingMapping.mapping_id, 
        astro_id
      );

      if (updatedAgent !== null) {

        const agent_info = await agentService.getAgentById(
          updatedAgent.agent_id
        );

        sticky_agent = {
          agent_id: updatedAgent.agent_id,
          agent_name: agent_info ? agent_info.agent_name : undefined,
        };
      }

      res.json({
        success: true,
        message: "Agent Updated",
        data: {
          user: {
            user_uuid: user.user_uuid,
            user_name: user.user_name,
            phone_number: user.phone_number,
            calling_number: user.calling_number,
            sticky_agent: sticky_agent,
          },
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Agent not updated",
      });
    }
  }
};

export const updatePostBookingAgentForUser = async (req: Request, res: Response) => {
  const user_id = req.body.user_id as unknown as number;
  const booking_id = req.body.booking_id as unknown as number;
  const astro_id = req.body.changeAstrologerId as unknown as number;

  try {
    // Update agent for user
    await updateAgentForUser(req, res);
    
    // Update agent for booking
    const updateBooking = await agentService.updateAgentForBooking(booking_id,astro_id);

    if (updateBooking) {
      res.json({
        success: true,
        message: "Agent updated for booking",
        data: {
          user_id: user_id,
          booking_id: booking_id,
          astro_id: astro_id
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to update agent for user",
      error: error.message
    });
  }
};


  export const updateUserDetails = async (req: Request, res: Response) => {
    const booking_uuid = req.params.booking_uuid as unknown as string;
    const agent_input_birth_details = req.body.birth_details
      .agent_input as unknown as BirthDetails["agent_input"];

    if (!agent_input_birth_details) {
      return sendErrorResponse(res, 400, "Invalid birth details");
    }

    const agent = extractAuthenticatedAgent(req);

    if (!agent) {
      return sendErrorResponse(res, 401, "Unauthorized");
    }

    const booking = await orderService.findBookingByUuid(booking_uuid);

    if (!booking) {
      return sendErrorResponse(res, 404, "Booking not found");
    }

    try {
      const user = await userService.findUserById(booking.user_id);

      if (!user) {
        return sendErrorResponse(res, 404, "User not found");
      }

      const user_id = user.user_id;

      const db_birth_details =
        user.birth_details as Prisma.JsonValue as BirthDetails;

      const updated_birth_details: BirthDetails = {
        ...db_birth_details,
        agent_input: {
          updated_by_agent_id: agent.agent_id,
          ...agent_input_birth_details,
        },
      };

      await userService.updateUser(user_id, {
        birth_details: updated_birth_details,
      });

      return res.json({
        success: true,
        message: "Birth details Updated",
      });
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  };

  export const removeIsoCode = async (req: Request, res: Response) => {
    const phone_number = req.body.phone_number as unknown as string;

    return res.json({
      success: true,
      message: "Iso code removed",
      data: {
        phone_number: phone_number.replaceAll("+91", ""),
      },
    });
  };

  export const saveCallingNumber = async (req: Request, res: Response) => {
    const phone_number = req.body.phone_number as unknown as string;
    const calling_number = req.body.calling_number as unknown as string;

    try {
      const user = await userService.findUserByPhone(phone_number);

      if (!user) {
        return sendErrorResponse(res, 404, "User not found");
      }

      let calling_number_cleaned = calling_number.replace(/\D/g, "");

      if (calling_number_cleaned.length === 10) {
        calling_number_cleaned = "91" + calling_number_cleaned;
      }

      if (calling_number_cleaned.length !== 12) {
        return sendErrorResponse(res, 400, "Invalid calling number");
      }

      await userService.updateUser(user.user_id, {
        calling_number: calling_number_cleaned,
      });

      return res.json({
        success: true,
        message: "Calling number saved",
      });
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  };

  export const processAllAwaitingScheduleBookings = async (
    req: Request,
    res: Response
  ) => {
    try {
      await orderService.processAllAwaitingScheduleBookings();
      res.send("All bookings processed successfully");
    } catch (err) {
      res.send("Failed to complete");
    }
  };

  export const fulfillPendingBookings = async (req: Request, res: Response) => {
    const user_id = parseInt(req.params.user_id) as number;

    try {
      const resp = await orderService.fulfillPendingBookings(user_id);
      res.json(resp);
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  };

  export const setStickyAgent = async (req: Request, res: Response) => {
    const user_id = parseInt(req.params.user_id) as number;
    const astro_id = req.body.astro_id as number;
    const rm_id = req.body.rm_id as number;

    try {
      if (astro_id) {
        await userService.setStickyAgent(user_id, astro_id, AGENT_ROLE.ASTRO);
      }
      if (rm_id) {
        await userService.setStickyAgent(user_id, rm_id, AGENT_ROLE.RM);
      }

      await getStickyAgent(req, res);
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  };

  export const getStickyAgent = async (req: Request, res: Response) => {
    const user_id = parseInt(req.params.user_id) as number;

    try {
      const astro_mapping = await userService.getStickyAgent(
        user_id,
        AGENT_ROLE.ASTRO
      );
      const rm_mapping = await userService.getStickyAgent(user_id, AGENT_ROLE.RM);

      res.json({
        success: true,
        message: "Sticky Agent Details",
        data: {
          user_id,
          astro_id: astro_mapping ? astro_mapping.agent_id : null,
          rm_id: rm_mapping ? rm_mapping.agent_id : null,
        },
      });
    } catch (error) {
      console.error(error);
      return sendErrorResponse(res);
    }
  };

  export const sendGroupLink = async (req: Request, res: Response) => {
    try {
      await watiService.sendGroupReminder();
      return res.status(200).json({ res: "successfully processed" });
    } catch (error: any) {
      return res.status(500).send("filed to process");
    }
  };

  export const sampleKundliReminder = async (req: Request, res: Response) => {
    try {
      await watiService.kundliReminder();
      return res.status(200).json({ res: "successfully processed" });
    } catch (error: any) {
      return res.status(500).send("filed to process");
    }
  };

  export const sendKundli = async (req: Request, res: Response) => {
    try {
      await watiService.kundiBoughtSender();
      return res.status(200).json({ res: "successfully processed" });
    } catch (error: any) {
      return res.status(500).send("filed to process");
    }
  };
