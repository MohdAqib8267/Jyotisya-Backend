import { Router, Express } from "express";

type Wrapper = (router: Express) => void;

export const createRoutes = (expressRoutes: Router, router: Router) => {
  router.use("/", expressRoutes);
};

export const applyMiddleware = (middlewares: Wrapper[], app: Express) => {
  for (const middleware of middlewares) {
    app.use(middleware);
  }
};
