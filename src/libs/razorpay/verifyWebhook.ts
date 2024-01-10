import { PAYMENT_GATEWAY, PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils";
import { orderService } from "../../services/services.factory";
import { PaymentLinkType } from "../../types";

const prisma = new PrismaClient();

export const processRazorpayWebhook = async (req: Request, res: Response) => {
  const isValidData = validateWebhookSignature(
    req.rawBody,
    req.headers["x-razorpay-signature"] as string,
    process.env.RAZORPAY_WEBHOOK_SECRET as string
  );

  const eventData = req.body;

  if (isValidData) {
    try {
      const insertedRow = await prisma.events_razorpay.create({
        data: {
          data: eventData,
        },
      });

      if (insertedRow) {
        if (eventData.event === "payment_link.paid") {
          orderService.markPaymentLinkPaid(
            PaymentLinkType.PAYMENT_LINK,
            eventData.payload.payment_link.entity.id,
            PAYMENT_GATEWAY.RAZORPAY
          );
        }

        if (eventData.event === "qr_code.credited") {
          orderService.markPaymentLinkPaid(
            PaymentLinkType.QR_CODE,
            eventData.payload.qr_code.entity.id,
            PAYMENT_GATEWAY.RAZORPAY
          );
        }

        return res.json({
          success: true,
          message: "Data Saved",
          data: {
            id: insertedRow.id,
          },
        });
      }
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: "An error occurred",
      });
    }
  }

  return res.status(400).json({
    success: false,
    message: "An error occurred",
  });
};
