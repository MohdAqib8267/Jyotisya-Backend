import { type } from "os";

export const cleanPayload = (data: any) => {
  if (typeof data === "object") {
    // for(const key of Object.keys(data)) {
    for (const _key in data) {
      const key = _key as keyof typeof data;
      if (typeof data[key] === "object") {
        data[key] = cleanPayload(data[key]);
      } else {
        data[key] = data[key].replaceAll("\n", "");
      }
    }
  }
  return data;
};
