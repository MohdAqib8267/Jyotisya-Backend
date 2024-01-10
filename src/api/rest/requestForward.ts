import { Request, Response } from "express";
import { cleanPayload } from "../../utils/common/cleanPayload";
import { userService } from "../../services/services.factory";

export const forward = async (req: Request, resp: Response) => {
  const data = cleanPayload({
    ...req.body,
  });
  const { stage, message, status } = await userService.forwardRequest(data);
  return resp.status(status).json({ message, stage });
};
