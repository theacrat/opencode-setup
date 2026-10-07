#!/usr/bin/env bun
import { run } from "./installer.ts";

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
