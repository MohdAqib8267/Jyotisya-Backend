import fs from "fs";
import { google } from "googleapis";
import appConfig from "../../config";
import { JWT } from "google-auth-library";
const SCOPE = [
  "https://spreadsheets.google.com/feeds",
  "https://www.googleapis.com/auth/drive",
];

let authorized_client: JWT;

const getCreds = async () => {
  return JSON.parse(fs.readFileSync(appConfig.GOOGLE_CREDS).toString());
};

const getJWTClient = async () => {
  const creds = await getCreds();
  return new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    SCOPE
  );
};

const authorize = async () => {
  const client = await getJWTClient();
  const token = await client.authorize();
  authorized_client = client;
  return client;
};

export const getSheetClient = async (
  sheetId?: string,
  pageName?: string,
  count = 0
): Promise<any> => {
  if (count > 5) {
    throw new Error("failed to get agent");
  }
  if (!authorized_client) {
    await authorize();
  }
  const sheets = google.sheets({ version: "v4", auth: authorized_client });
  try {
    return sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: pageName,
    });
  } catch (err) {
    await authorize();
    return getSheetClient(sheetId, pageName, count + 1);
  }
};
