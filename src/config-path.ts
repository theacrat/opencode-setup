// oxlint-disable-next-line import/no-nodejs-modules -- The CLI resolves native platform configuration paths.
import { homedir } from "node:os";
// oxlint-disable-next-line import/no-nodejs-modules -- Native paths must support Linux, macOS and Windows.
import path from "node:path";

import type { Environment } from "./platform.ts";

function configPath(override: string | undefined, env: Environment): string {
  const fallbackHome = path.join(homedir(), ".config");
  return path.resolve(
    override ??
      (env.OPENCODE_CONFIG_DIR?.length ? env.OPENCODE_CONFIG_DIR : undefined) ??
      path.join(
        (env.XDG_CONFIG_HOME?.length ? env.XDG_CONFIG_HOME : undefined) ?? fallbackHome,
        "opencode",
      ),
  );
}

export { configPath };
