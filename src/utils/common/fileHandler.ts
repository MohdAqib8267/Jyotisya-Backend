import { stat, mkdir } from "node:fs/promises";
import { Stream } from "node:stream";
import { promisify } from "node:util";
import stream from "stream";

export const checkAndMakeDirectory = async (dir: string) => {
  try {
    await stat(dir);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      try {
        await mkdir(dir);
      } catch (err: any) {
        console.error(err?.message);
      }
    }
  }
};

export function waitForStreamToEnd(stream: Stream) {
  return new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });
}

export const pipeline = promisify(stream.pipeline);
