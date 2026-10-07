// oxlint-disable-next-line import/no-nodejs-modules -- Native server integration observes child process events.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Use the platform event promise API for process lifecycle.
import { once } from "node:events";
// oxlint-disable-next-line import/no-nodejs-modules -- Read startup diagnostics as a line stream.
import { createInterface } from "node:readline";
// oxlint-disable-next-line import/no-nodejs-modules -- Poll the native server with a cancellable platform delay.
import { setTimeout as delay } from "node:timers/promises";

import { sequence } from "@/sequence.ts";

import runProcess from "./process.ts";

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  await once(child, "exit");
}

async function waitForUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  const lines = createInterface({ input: child.stdout });
  const timeout = setTimeout(() => {
    lines.close();
  }, 15_000);
  try {
    for await (const line of lines) {
      try {
        const value: unknown = JSON.parse(line);
        if (
          typeof value === "object" &&
          value !== null &&
          "url" in value &&
          typeof value.url === "string"
        ) {
          return value.url;
        }
      } catch {
        // Startup may include non-JSON diagnostic lines.
      }
    }
    throw new Error("Isolated OpenCode did not announce its URL");
  } finally {
    clearTimeout(timeout);
    lines.close();
  }
}

async function probeSkills(
  binary: string,
  url: string,
  root: string,
  env: NodeJS.ProcessEnv,
  attempt = 0,
): Promise<{ ids: string[]; lastResponse: string }> {
  const options = { cwd: root, encoding: "utf8" as const, env, timeout: 10_000 };
  await runProcess(binary, ["api", "--server", url, "GET", "/api/plugin"], options);
  const result = await runProcess(binary, ["api", "--server", url, "GET", "/api/skill"], options);
  const lastResponse = `${result.status} ${result.stdout} ${result.stderr}`;
  let ids: string[] = [];
  if (result.status === 0) {
    const response: unknown = JSON.parse(result.stdout);
    const values =
      typeof response === "object" && response !== null && "data" in response
        ? response.data
        : response;
    if (Array.isArray(values)) {
      ids = values.flatMap((value: unknown) =>
        typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
          ? [value.id]
          : [],
      );
    }
  }
  if (ids.includes("vercel-react-best-practices") || attempt >= 29) {
    return { ids, lastResponse };
  }
  await delay(100);
  return probeSkills(binary, url, root, env, attempt + 1);
}

const native = { probeSkills, sequence, waitForExit, waitForUrl };
export default native;
