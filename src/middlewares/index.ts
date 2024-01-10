import { agent, AGENT_ROLE } from "@prisma/client";
import express, { NextFunction, Request, Response } from "express";
import { allowCORS } from "./cors";

import { auth } from "./middleware.factory";

export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return auth.authenticate((err: any, user: agent | null, info: any) => {
    if (err) {
      return next(err);
    }

    if (user && (user.role === AGENT_ROLE.ADMIN || AGENT_ROLE.AGENCY_ADMIN)) {
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Please login to continue",
    });

    // The user object will be present downstream via req.user
  })(req, res, next);
};

export const astroAndRmAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return auth.authenticate((err: any, user: agent | null, info: any) => {
    if (err) {
      return next(err);
    }

    if (
      user &&
      (user.role === AGENT_ROLE.ASTRO ||
        user.role === AGENT_ROLE.RM ||
        user.role === AGENT_ROLE.ADMIN ||
        user.role === AGENT_ROLE.AGENCY_ADMIN)
    ) {
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Please login to continue",
    });

    // The user object will be present downstream via req.user
  })(req, res, next);
};

export const rmAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return auth.authenticate((err: any, user: agent | null, info: any) => {
    if (err) {
      return next(err);
    }

    if (
      user &&
      (user.role === AGENT_ROLE.RM ||
        user.role === AGENT_ROLE.ADMIN ||
        user.role === AGENT_ROLE.AGENCY_ADMIN)
    ) {
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Please login to continue",
    });

    // The user object will be present downstream via req.user
  })(req, res, next);
};

export const astroAuthMiddleWare = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return auth.authenticate((err: any, user: agent | null, info: any) => {
    if (err) {
      return next(err);
    }

    if (
      user &&
      (user.role === AGENT_ROLE.ASTRO || user.role === AGENT_ROLE.ADMIN)
    ) {
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Please login to continue",
    });

    // The user object will be present downstream via req.user
  })(req, res, next);
};

const middlewares = [
  express.json({
    verify: (req, res, buf) => {
      if (req.url && req.url.includes("/webhooks/razorpay")) {
        req.rawBody = buf.toString();
      }
    },
  }),
  // auth.initialize(),
  // authMiddleWare,
];

// if (process.env.NODE_ENV !== 'production') {
middlewares.push(allowCORS);
// }

export default middlewares;
