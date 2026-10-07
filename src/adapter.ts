// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { readFile, realpath } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { createRequire } from "node:module";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { homedir } from "node:os";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { fileURLToPath } from "node:url";

import { stat } from "./filesystem.ts";
import { contained } from "./paths.ts";
import { execute } from "./platform.ts";
import type { Environment } from "./platform.ts";
import { object } from "./values.ts";
import type { ObjectValue } from "./values.ts";

const ADAPTER_VERSION = "0.2.2";
const ADAPTER_SPEC = `oc-agent-plugins@${ADAPTER_VERSION}`;

function isNpmAdapter(reference: string): boolean {
  return /^oc-agent-plugins(?:@[^\s]+)?$/u.test(reference);
}

async function adapterSource(override: string | undefined) {
  const packageFile = override
    ? path.join(await realpath(path.resolve(override)), "package.json")
    : createRequire(import.meta.url).resolve("oc-agent-plugins/package.json");
  const directory = await realpath(path.dirname(packageFile));
  const pkg = object(JSON.parse(await readFile(packageFile, "utf8")), "adapter package.json");
  const bin =
    typeof pkg["bin"] === "string"
      ? pkg["bin"]
      : object(pkg["bin"] ?? {}, "adapter bin")["oc-agent-plugins"];
  const cli = path.resolve(directory, typeof bin === "string" ? bin : "dist/cli.js");
  const invalid = override
    ? `Expected built oc-agent-plugins checkout at ${directory}. Run bun install and bun run build there.`
    : `Expected installed ${ADAPTER_SPEC} with its CLI. Run bun install --frozen-lockfile.`;
  if (
    pkg["name"] !== "oc-agent-plugins" ||
    (!override && (pkg["version"] !== ADAPTER_VERSION || typeof bin !== "string")) ||
    !contained(directory, cli)
  ) {
    throw new Error(invalid);
  }
  const cliInfo = await stat(cli);
  if (!cliInfo?.isFile() || !contained(directory, await realpath(cli))) {
    throw new Error(invalid);
  }
  const entryInfo = await stat(path.join(directory, "index.ts"));
  if (!entryInfo?.isFile()) {
    throw new Error(invalid);
  }
  return { cli, directory, reference: override ? directory : ADAPTER_SPEC };
}

async function isLocalAdapter(candidate: string): Promise<boolean> {
  const file = path.join(candidate, "package.json");
  const packageInfo = await stat(file);
  if (!packageInfo?.isFile()) {
    return false;
  }
  try {
    return object(JSON.parse(await readFile(file, "utf8")), file)["name"] === "oc-agent-plugins";
  } catch {
    return false;
  }
}

function localPluginPath(reference: string, config: string): string | undefined {
  if (reference.startsWith("file:")) {
    return fileURLToPath(reference);
  }
  if (reference.startsWith(`~${path.sep}`) || reference.startsWith("~/")) {
    return path.join(homedir(), reference.slice(2));
  }
  if (path.isAbsolute(reference)) {
    return reference;
  }
  if (reference.startsWith(".")) {
    return path.resolve(config, reference);
  }
  return undefined;
}

async function matchesLocalAdapter(
  candidate: string,
  override: string | undefined,
  directory: string,
  parent: string,
): Promise<boolean> {
  const info = await stat(candidate);
  if (override) {
    return info !== undefined && (await realpath(candidate)) === directory;
  }
  if (!info) {
    return path.resolve(candidate) === path.join(parent, "opencode-agent-plugins");
  }
  return isLocalAdapter(candidate);
}
async function manager(
  cli: string,
  config: string,
  args: string[],
  env: Environment,
): Promise<ObjectValue> {
  let stdout: string;
  try {
    ({ stdout } = await execute("node", [cli, ...args, "--global", "--json"], {
      ...env,
      OPENCODE_CONFIG_DIR: config,
    }));
  } catch (error) {
    throw new Error(
      `Adapter manager ${args[0]} failed. Install Node >=22.14 if unavailable: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return object(JSON.parse(stdout), "adapter manager response");
}

export { adapterSource, isNpmAdapter, localPluginPath, matchesLocalAdapter, manager };
