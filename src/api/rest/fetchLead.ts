import LeadStatusRepository from "../../data/repositories/leadStatus.db";
import { Request, Response } from "express";

export const fetchLead = async (req: Request, res: Response) => {
  try {
    const note = "Upsell next session";
    const fetchData = new LeadStatusRepository();
    const data = {
      agentId: req.body.agent_id,
    };
    if (!data.agentId) {
      return res.status(400).json({
        message: "No agent_id received",
      });
    }
    const status = await fetchData.fetchLead(data.agentId);
    return res.status(200).json({
      message: "New leads fetched",
      body: [status, { note: note }],
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Error in fetching new lead",
    });
  }
};
