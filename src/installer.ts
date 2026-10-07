// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { adapterSource, manager } from "./adapter.ts";
import { configPath } from "./config-path.ts";
import { documents, planConfiguration, writeConfiguration } from "./configuration.ts";
import { stat } from "./filesystem.ts";
import { pendingVendors, validatePending } from "./inventory.ts";
import { skillsFrom, validateView, createView, prepareSources } from "./native-skills.ts";
import type { Environment } from "./platform.ts";
import { sequence } from "./sequence.ts";
import { stagedSource, stageVendor } from "./staging.ts";

const HELP = `Install OpenCode V2 vendor plugins and self-contained native skills.

Usage: bun run setup [--dry-run] [--adapter PATH] [--config-dir PATH]

Defaults: installed oc-agent-plugins@0.2.2 and fixed upstream native sources.
--adapter PATH selects an optional built local adapter instead of npm.
Config: OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME/opencode, ~/.config/opencode.
--dry-run validates and reports without writes or network retrieval.
Existing healthy owned vendor snapshots are skipped, including disabled packages.
Use the adapter's update command explicitly to refresh snapshots.
--help, -h show this help.`;

function argumentsFrom(argv: string[]) {
  const options = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg || !["--adapter", "--config-dir"].includes(arg)) {
      throw new Error(`Unknown argument ${arg}. Use --help.`);
    }
    const value = argv[(index += 1)];
    if (!value || value.startsWith("--") || options.has(arg)) {
      throw new Error(`Expected one path after ${arg}`);
    }
    options.set(arg, value);
  }
  return { dryRun, options };
}
async function locations(options: Map<string, string>, env: Environment) {
  const parent = path.resolve(import.meta.dirname, "../..");
  const override = options.get("--adapter");
  const adapter = await adapterSource(override);
  const config = configPath(options.get("--config-dir"), env);
  return { adapter, config, override, parent };
}
function reportPlan(
  config: string,
  dryRun: boolean,
  skills: { name: string; directory: string }[],
  pending: Awaited<ReturnType<typeof pendingVendors>>,
  adapterEntry: string,
  view: string,
  file: string,
): boolean {
  for (const skill of skills) {
    console.log(`Native ${skill.name} -> ${skill.directory}`);
  }
  for (const vendor of pending) {
    console.log(
      `Install ${vendor.source}${"subdir" in vendor ? ` --subdir ${vendor.subdir}` : ""}`,
    );
  }
  if (dryRun) {
    for (const vendor of pending) {
      if (vendor.staged) {
        console.log(
          `Would create owned compatibility stage at ${stagedSource(config, vendor.name)}. No staging performed.`,
        );
      }
    }
    console.log(`Would register ${adapterEntry} and ${view} in ${file}. No writes performed.`);
    return true;
  }
  return false;
}
export async function run(argv: string[], env: Environment): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const { options, dryRun } = argumentsFrom(argv);
  const { parent, override, adapter, config } = await locations(options, env);
  const { cli } = adapter;
  const configInfo = await stat(config);
  if (configInfo && (!configInfo.isDirectory() || configInfo.isSymbolicLink())) {
    throw new Error(`Config target must be a regular directory: ${config}`);
  }
  const docs = await documents(config);
  const skills = await skillsFrom(config, path.join(parent, "ai-config"));
  const view = path.join(config, "setup-native-skills");
  await validateView(view, skills);
  const { target, updated } = await planConfiguration(
    docs,
    config,
    view,
    adapter,
    override,
    parent,
  );
  const adapterEntry = adapter.reference;
  const pending = await pendingVendors(cli, config, env);
  console.log(`${dryRun ? "Dry run" : "Target"}: ${config}`);
  await validatePending(config, pending);
  if (reportPlan(config, dryRun, skills, pending, adapterEntry, view, target.file)) {
    await prepareSources(config, env, true);
    return;
  }
  try {
    await prepareSources(config, env, false);
    await sequence(pending, async (vendor) => {
      const source = vendor.staged ? await stageVendor(config, vendor.name, env) : vendor.source;
      await manager(cli, config, ["install", source], env);
      console.log(`Installed ${vendor.name}`);
    });
    await createView(view, skills);
    await writeConfiguration(target, updated);
  } catch (error) {
    throw new Error(
      `Partial setup; earlier installed snapshots or native links are retained. Rerun after resolving the error. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  console.log(`Configured ${target.file}. No trust granted or OpenCode/MCP processes started.`);
}
