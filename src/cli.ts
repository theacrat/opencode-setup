#!/usr/bin/env bun
import { run } from "./installer.ts";

// oxlint-disable-next-line node/no-process-env -- Capture the shell environment once at the executable boundary and inject it thereafter.
const env: NodeJS.ProcessEnv = { ...process.env };
try {
  // oxlint-disable-next-line node/no-top-level-await -- Bun executable entry point is never imported through require(esm).
  await run(process.argv.slice(2), env);
} catch (error) {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
