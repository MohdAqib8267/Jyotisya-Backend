import { config } from "dotenv";

config();

const configObject: Record<string, Record<string, any>> = {
  development: {
    keepAliveTimeout: 3000,
    headersTimeout: 3000,
    group_reminder_whatsapp_link: {
      EXPLORER: "http://bit.ly/Join_Jyotisya",
      ASPIRER: "http://bit.ly/JyotisyaTips",
      PAYER: "http://bit.ly/JyotisyaTipsRemedies",
    },
  },
  test: {
    keepAliveTimeout: 3000,
    headersTimeout: 3000,
    group_reminder_whatsapp_link: {
      EXPLORER: "http://bit.ly/Join_Jyotisya",
      ASPIRER: "http://bit.ly/JyotisyaTips",
      PAYER: "http://bit.ly/JyotisyaTipsRemedies",
    },
  },
  production: {
    keepAliveTimeout: 3000,
    headersTimeout: 3000,
    group_reminder_whatsapp_link: {
      EXPLORER: "http://bit.ly/Join_Jyotisya",
      ASPIRER: "http://bit.ly/JyotisyaTips",
      PAYER: "http://bit.ly/JyotisyaTipsRemedies",
    },
  },
};

const _appConfig = configObject[process.env.NODE_ENV || "development"];

_appConfig["accessTokenSecret"] = process.env.JWT_TOKEN;
_appConfig["status_map_astro"] = {
  Done: 9,
  "Number busy": 1,
  "Not Reachable": 3,
  "Customer Not Interested": 2,
  "Call back later": 4,
};

_appConfig["status_map_rm"] = {
  "Not Interested": 101,
  "5min call scheduled": 102,
  "D0 Interested": 103,
  "D1 Interested": 104,
  "Pricing Too High": 105,
  "Not Interested Bad Experience": 110,
  "Call not Connected": 106,
  "Call Back Later": 107,
  "D2 Interested": 108,
  "D3 Interested": 109,
};

_appConfig["RABBITMQ_URL"] = process.env.RABBITMQ_URL;
_appConfig["GOOGLE_CREDS"] = "./key.json";
const appConfig = Object.freeze(_appConfig);
export default appConfig;
