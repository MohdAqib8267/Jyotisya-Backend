import { Request, Response } from "express";
import { userService } from "../../services/services.factory";

export const kundliGenerator = async (req: Request, res: Response) => {
  const body = req.body;
  const { uuid, chart_type } = body;
  try {
    const url = await userService.getKundaliChart(uuid, chart_type);
    return res.send({ url }).status(200);
  } catch (err) {
    return res.sendStatus(500);
  }
};
