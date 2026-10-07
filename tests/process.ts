// oxlint-disable-next-line import/no-nodejs-modules -- Test fixtures execute real local CLI processes.
import { execFile } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Native subprocess callback bridge.
import { promisify } from "node:util";

// oxlint-disable-next-line typescript/strict-void-return -- Node promisify consumes execFile's callback, not its returned ChildProcess.
const execute = promisify(execFile);

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; encoding: "utf8"; env?: NodeJS.ProcessEnv; timeout?: number },
) {
  try {
    const { stdout, stderr } = await execute(command, args, {
      ...options,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { status: 0, stderr, stdout };
  } catch (error) {
    if (
      error instanceof Error &&
      "stdout" in error &&
      typeof error.stdout === "string" &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return { status: 1, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}
export default runProcess;
