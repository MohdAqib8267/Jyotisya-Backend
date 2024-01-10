import passport from "passport";
import appConfig from "../config";
import { Request } from "express";
import { Strategy, ExtractJwt, VerifiedCallback } from "passport-jwt";
import prisma from "../data";
import { agent, Prisma } from "@prisma/client";
import { agentRepo } from "../data/repositories/repository.factory";
import { JyotistaJWTAgentInfo, JyotisyaJWTPayload } from "../types";
import jwt from "jsonwebtoken";

class Auth {
  private _agent_credential: Prisma.agent_credentialDelegate<
    Prisma.RejectOnNotFound | Prisma.RejectPerOperation | undefined
  >;
  constructor() {
    this._agent_credential = prisma.agent_credential;
    this.initialize();
  }
  public initialize = () => {
    passport.use("jwt", this.getStrategy());
    return passport.initialize();
  };

  private getStrategy(): Strategy {
    const params = {
      secretOrKey: appConfig.accessTokenSecret,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
    };

    return new Strategy(
      params,
      async (req: Request, payload: any, done: VerifiedCallback) => {
        const agent = (await agentRepo.findOneById(
          "agent_id",
          payload.agent_id
        )) as agent | null;

        if (agent && agent.is_active) {
          return done(null, agent);
        }
        return done(null, false, {
          success: false,
          message: "The user in the token was not found",
        });
      }
    );
  }

  public createToken = (payload: JyotistaJWTAgentInfo): string => {
    const now = Math.floor(new Date().getTime() / 1000);
    const exp = now + 180 * 86400;
    return jwt.sign(
      { ...payload, iat: now, exp: exp, iss: "api.jyotisya.ai" },
      appConfig.accessTokenSecret
    );
  };

  public authenticate = (callback: any) => {
    return passport.authenticate(
      "jwt",
      { session: false, failWithError: false },
      callback
    );
  };
}

export default Auth;
