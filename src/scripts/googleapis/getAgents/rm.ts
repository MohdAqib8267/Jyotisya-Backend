import moment from "moment";
import { getSheetData } from "../getSheetData";

const getTimeBlock = (time: string) => {
  const fetch_time = moment(time, "DD-MM-YYYY hh:mm:ss a").format("HH:MM");
  const time_split = fetch_time.split(":");
  console.log(time_split);

  if (parseInt(time_split[1]) > 30) {
    return `${time_split[0]}:30`;
  }
  return `${time_split[0]}:00`;
};

const convert2DarrayToJSON = (
  data: any
): Record<string, Record<string, string>> => {
  const obj: Record<string, Record<string, string>> = {};
  for (let i in data) {
    if (i == "0") {
      continue;
    }
    const name = data[i][0];
    const id = data[i][1];
    obj[name] = {
      id,
    };
    for (let j in data[i]) {
      if (j == "0" || j == "1") {
        continue;
      }
      obj[name][data[0][j]] = data[i][j];
    }
  }
  return obj;
};

export const getActiveRM = async (time: string) => {
  const returnObj: any[] = [];
  const list = convert2DarrayToJSON(
    await getSheetData("1oBKN7w8zVOHJJdpNies-IbwH2qs6DTHaPEU-xM7YWbs", "RM")
  );
  const timeBlock = getTimeBlock(time);
  for (const astro of Object.keys(list)) {
    if (list[astro][timeBlock] === "y") {
      returnObj.push({ name: astro, agent_id: list[astro].id });
    }
  }
  return returnObj;
};
