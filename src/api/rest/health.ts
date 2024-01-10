import { Request, Response } from "express";

export const health = (req: Request, res: Response) => {
  return res.json({
    status: 200,
    desc: "Jyotisya api backend",
  });
};
