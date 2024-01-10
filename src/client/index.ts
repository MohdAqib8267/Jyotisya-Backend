import Logger from "../utils/log";
import AstrologyAPIClient from "./astrologyApi.client";
import JyotisyaLambdaClient from "./jyotisya.lambda.client";
import { WatiClient } from "./wati.client";

export const watiClient = new WatiClient({
  name: "Wati client",
  logger: new Logger("Wati Client"),
  timeout: 100000,
});

export const astrologyApiClient = new AstrologyAPIClient({
  name: "Astrology API client",
  logger: new Logger("Astrology API Client"),
});

export const jyotisyaLambdaApiClient = new JyotisyaLambdaClient({
  name: "Jyotisya Lambda Client",
  logger: new Logger("Jyotisya Lambda Client"),
  timeout: 100000,
});
