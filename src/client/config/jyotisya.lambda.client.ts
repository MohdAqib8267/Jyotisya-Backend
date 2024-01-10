import { JyotisyaLambdaClientConfig } from "../types";

const config: Record<string, JyotisyaLambdaClientConfig> = {
  development: {
    base_url:
      "https://5h9c2vrsih.execute-api.ap-south-1.amazonaws.com/production",
    token: "1DM9TCsGokR3ZX0kCq4b1aQAstro0C2BtlCbQ4lrjJ",
  },
  test: {
    base_url:
      "https://5h9c2vrsih.execute-api.ap-south-1.amazonaws.com/production",
    token: "1DM9TCsGokR3ZX0kCq4b1aQAstro0C2BtlCbQ4lrjJ",
  },
  beta: {
    base_url:
      "https://5h9c2vrsih.execute-api.ap-south-1.amazonaws.com/production",
    token: "1DM9TCsGokR3ZX0kCq4b1aQAstro0C2BtlCbQ4lrjJ",
  },
  production: {
    base_url:
      "https://5h9c2vrsih.execute-api.ap-south-1.amazonaws.com/production",
    token: "1DM9TCsGokR3ZX0kCq4b1aQAstro0C2BtlCbQ4lrjJ",
  },
};

export const jyotisyaLambdaApiConfig = config[
  process.env.APP_ENV || "development"
] as JyotisyaLambdaClientConfig;
