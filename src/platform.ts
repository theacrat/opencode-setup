// oxlint-disable-next-line import/no-nodejs-modules -- CLI subprocess boundary requires the native Node API.
import { execFile } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Promisify the native subprocess callback without a custom promise.
import { promisify } from "node:util";

// oxlint-disable-next-line typescript/strict-void-return -- Node promisify intentionally accepts execFile's returned ChildProcess and uses its callback.
const executeFile = promisify(execFile);

interface Environment {
  readonly [key: string]: string | undefined;
  readonly OPENCODE_CONFIG_DIR?: string;
  readonly XDG_CONFIG_HOME?: string;
  readonly PATH?: string | undefined;
  readonly SystemRoot?: string | undefined;
  readonly TEMP?: string | undefined;
  readonly TMP?: string | undefined;
}

async function execute(command: string, args: string[], env: Environment) {
  return executeFile(command, args, { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
}

export { execute };
export type { Environment };
