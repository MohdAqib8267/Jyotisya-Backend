import { getSheetClient } from "./getClient";

export const getSheetData = async (sheetId: string, pageName: string) => {
  const client = await getSheetClient(sheetId, pageName);
  return client.data.values;
};
