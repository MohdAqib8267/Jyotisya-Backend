import { BaseServiceParams } from "../types";
import UserRepository from "../data/repositories/user.db";
import axios, { AxiosError } from "axios";
import AgentRepository from "../data/repositories/agent.db";
import LeadStatusRepository from "../data/repositories/leadStatus.db";
import KnowlarityRepository from "../data/repositories/knowlarity.db";
import Logger from "../utils/log";
import { _logError } from "../utils/error";
import AstrologyAPIClient from "../client/astrologyApi.client";
import UserKundliRepository from "../data/repositories/userKundli.db";
import JyotisyaLambdaClient from "../client/jyotisya.lambda.client";

export class BaseService {
  protected _logger: Logger;
  protected userRepo: UserRepository;
  protected agentRepo: AgentRepository;
  protected leadStatusRepo: LeadStatusRepository;
  protected knowlarityRepo: KnowlarityRepository;
  protected userKundliRepo: UserKundliRepository;
  protected config: Readonly<Record<string, any>>;
  protected astrologApi: AstrologyAPIClient;
  protected jyotisyaLambdaApi: JyotisyaLambdaClient;
  constructor(params: BaseServiceParams) {
    this._logger = params.logger;
    this.userRepo = params.userRepo;
    this.agentRepo = params.agentRepo;
    this.knowlarityRepo = params.knowlarityRepo;
    this.leadStatusRepo = params.leadStatusRepo;
    this.userKundliRepo = params.userKundliRepo;
    this.config = params.config;
    this.astrologApi = params.astrologyApiClient;
    this.jyotisyaLambdaApi = params.jyotisyaLambdaApiClient;
  }

  async callApi(url: string, method: string, payload?: Object) {
    if (method.toUpperCase() === "POST") {
      return await axios({
        url,
        method,
        data: payload,
      });
    } else if (method.toUpperCase() === "GET") {
      return await axios({
        url,
        method,
      });
    }
  }

  getAvailableAgents = async (active_agents: any[]) => {
    const active_astro_ids = active_agents.map((agent) => agent.agent_id);
    const busyAstroIds = (
      await this.leadStatusRepo.findBusyAgent(active_astro_ids)
    ).map((agent) => agent.agent_id);
    const available_astro = active_agents.filter(
      (agent) => !busyAstroIds.includes(agent.agent_id)
    );
    if (!available_astro.length) {
      return {};
    }
    return available_astro[Math.floor(Math.random() * available_astro.length)];
  };

  updateTeleCRM(data: any) {
    const url =
      "https://app.telecrm.in/api/b1/enterprise/63859df08e04300008781545/autoupdatelead";
    return this.callApi(url, "POST", data);
  }
}
