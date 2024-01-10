import { Request, response, Response } from "express";
import moment from "moment";
import { processKnowlarityEvent } from "../../libs/knowlarity";
import { knowlarityService } from "../../services/services.factory";

export const processKnowlarityWebhook = async (req: Request, res: Response) => {
  await processKnowlarityEvent(req.body);

  res.status(200).json({
    success: true,
  });
};
