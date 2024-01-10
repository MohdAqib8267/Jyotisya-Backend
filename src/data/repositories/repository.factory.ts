import AgentRepository from "./agent.db";
import LeadStatusRepository from "./leadStatus.db";
import UserRepository from "./user.db";
import KnowlarityRepository from "./knowlarity.db";
import UserKundliRepository from "./userKundli.db";

export const userRepo = new UserRepository();

export const agentRepo = new AgentRepository();

export const leadStatusRepo = new LeadStatusRepository();

export const knowlarityRepo = new KnowlarityRepository();

export const userKundliRepo = new UserKundliRepository();
