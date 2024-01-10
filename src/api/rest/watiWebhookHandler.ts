import { MESSAGE_DIRECTION, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { userService } from "../../services/services.factory";
import prisma from "../../data";
import type { user as User } from "@prisma/client";
import { sendErrorResponse } from "../../utils/http";

export const saveReceivedMessage = async (
  user_id: number,
  payload: any
): Promise<boolean> => {
  try {
    const { waId, timestamp, whatsappMessageId } = payload;
    const event_timestamp = new Date(parseInt(timestamp) * 1000);

    await prisma.whatsapp_message.create({
      data: {
        whatsapp_message_id: whatsappMessageId,
        user_id: user_id,
        message_direction: MESSAGE_DIRECTION.INCOMING,
        wa_id: waId,
        message_payload: payload,
        received_at: event_timestamp,
      },
    });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const saveSentMessage = async (
  user_id: number,
  payload: any
): Promise<boolean> => {
  try {
    const { waId, timestamp, created, whatsappMessageId } = payload;
    const event_timestamp = timestamp
      ? new Date(parseInt(timestamp) * 1000)
      : new Date(created);

    await prisma.whatsapp_message.create({
      data: {
        whatsapp_message_id: whatsappMessageId,
        user_id: user_id,
        message_direction: MESSAGE_DIRECTION.OUTGOING,
        wa_id: waId,
        message_payload: payload,
        sent_at: event_timestamp,
        template_id: payload.templateId || null,
        template_name: payload.templateName || null,
      },
    });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const updateSentMessageStatus = async (
  whatsapp_message_id: string,
  data: Prisma.whatsapp_messageUpdateInput,
  event_timestamp: Date
): Promise<boolean> => {
  if (Object.keys(data).length === 0) {
    return false;
  }

  try {
    const existingRow = await prisma.whatsapp_message.findUnique({
      where: {
        whatsapp_message_id: whatsapp_message_id,
      },
    });

    if (!existingRow) {
      return true;
    }

    await prisma.whatsapp_message.update({
      where: {
        id: existingRow.id,
      },
      data: data,
    });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const processWatiWebhook = async (req: Request, res: Response) => {
  const watiEvent = req.body;
  const eventType = watiEvent.eventType;

  let user: User | null = null;
  if (watiEvent.waId) {
    user = await userService.findOrCreateUser(
      watiEvent.waId,
      watiEvent.senderName || ""
    );
  }

  // Save user on new message
  let result = false;
  const updatedFields: Prisma.whatsapp_messageUpdateInput = {};

  switch (eventType) {
    case "newContactMessageReceived":
      result = true;
      break;
    case "message":
      result = await saveReceivedMessage(user ? user.user_id : 1, watiEvent);
      break;
    case "sessionMessageSent":
    case "templateMessageSent":
      result = await saveSentMessage(user ? user.user_id : 1, watiEvent);
      break;
    case "sentMessageDELIVERED":
    case "sentMessageREAD":
    case "sentMessageREPLIED":
      const event_timestamp = new Date(parseInt(watiEvent.timestamp) * 1000);
      const whatsapp_message_id = watiEvent.whatsappMessageId;
      switch (eventType) {
        case "sentMessageDELIVERED":
          updatedFields.delivered_at = event_timestamp;
          break;
        case "sentMessageREAD":
          updatedFields.read_at = event_timestamp;
          break;
        case "sentMessageREPLIED":
          updatedFields.replied_at = event_timestamp;
          break;
      }

      result = await updateSentMessageStatus(
        whatsapp_message_id,
        updatedFields,
        event_timestamp
      );
      break;
  }

  if (result) {
    return res.json({
      success: true,
      message: "WATI webhook processed successfully",
    });
  }

  console.error("Error processing WATI webhook", watiEvent);

  return sendErrorResponse(res, 400, "Error processing WATI webhook");
};
