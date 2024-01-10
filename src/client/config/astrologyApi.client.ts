import { AstroClientConfig } from "../types";

const config: Record<string, AstroClientConfig> = {
  development: {
    base_url: "https://json.astrologyapi.com/v1/",
    token: "NjIzMjQyOjAxODk4YTY4ODg4Mjk5ZDNkNWQ5MWIxODU0MTAwNDBi",
  },
  test: {
    token: "",
    base_url: "",
  },
  beta: {
    token: "",
    base_url: "",
  },
  production: {
    token: "",
    base_url: "",
  },
};

export const astrlogyApiConfig = config[
  process.env.APP_ENV || "development"
] as AstroClientConfig;
