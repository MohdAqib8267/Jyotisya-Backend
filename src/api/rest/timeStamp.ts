import moment from "moment-timezone";
import { Request, Response } from "express";

export const currentTime = (req: Request, resp: Response) => {
  const date = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
  return resp.status(200).send(date);
};
