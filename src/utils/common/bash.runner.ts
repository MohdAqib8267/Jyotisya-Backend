import { promisify } from "util";
import { execFile } from "child_process";

export const scriptRunner = async (fileName: string, args: string[]) => {
  const fileExecutor = promisify(execFile);
  const pid = await fileExecutor(fileName, args);
  return pid;
};
