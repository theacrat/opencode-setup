// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { manager } from "./adapter.ts";
import { stat } from "./filesystem.ts";
import type { Environment } from "./platform.ts";
import { validateRefresh } from "./refresh.ts";
import { sequence } from "./sequence.ts";
import { stagedSource, validateStage } from "./staging.ts";
import { object } from "./values.ts";
import { VENDORS } from "./vendors.ts";

type Vendor = (typeof VENDORS)[number];
async function validateManagerJournal(config: string) {
  if (await stat(path.join(config, ".agent-plugins-manager", "journal.json"))) {
    throw new Error(
      "Interrupted adapter transaction; inspect adapter doctor and recover explicitly before setup.",
    );
  }
}
async function validateVendorTargets(config: string, name: string, listed: boolean) {
  await sequence(["agent-plugins", ".agent-plugins-disabled"], async (store) => {
    const parent = path.join(config, store);
    const parentInfo = await stat(parent);
    if (parentInfo && (!parentInfo.isDirectory() || parentInfo.isSymbolicLink())) {
      throw new Error(`Unsafe vendor store: ${parent}`);
    }
    const target = path.join(parent, name);
    const info = await stat(target);
    if (info && (!info.isDirectory() || info.isSymbolicLink() || !listed)) {
      throw new Error(
        `Conflicting vendor target: ${target}. Preserve it and move it aside deliberately.`,
      );
    }
  });
}
function validatedInventory(value: unknown) {
  if (!Array.isArray(value)) {
    throw new TypeError("Adapter list response must include entries");
  }
  const entries = value.map((entry) => object(entry, "installation"));
  for (const entry of entries) {
    if (entry["problem"] !== undefined) {
      throw new Error(
        `Cannot use manager inventory: conflicting, edited or unmanaged installation or manager state ${String(entry["name"])}. Inspect adapter doctor/info.`,
      );
    }
  }
  return entries;
}
async function pendingVendors(cli: string, config: string, env: Environment): Promise<Vendor[]> {
  await validateManagerJournal(config);
  const managerResult = await manager(cli, config, ["list"], env);
  const inventory = validatedInventory(managerResult["entries"]);
  const pending: (typeof VENDORS)[number][] = [];
  await sequence(VENDORS, async (vendor) => {
    const matches = inventory.filter((entry) => entry["name"] === vendor.name);
    await validateVendorTargets(config, vendor.name, matches.length > 0);
    if (matches.length === 0) {
      pending.push(vendor);
      return;
    }
    const [entry] = matches;
    if (
      !entry ||
      matches.length !== 1 ||
      entry["managed"] !== true ||
      entry["problem"] !== undefined
    ) {
      throw new Error(
        `Cannot use ${vendor.name}: conflicting, edited or unmanaged installation. Inspect adapter doctor/info.`,
      );
    }
    const receipt = object(entry["receipt"], `${vendor.name} receipt`);
    const source = object(receipt["source"], `${vendor.name} source`);
    const matchesSource = vendor.staged
      ? source["kind"] === "local" && source["path"] === stagedSource(config, vendor.name)
      : source["kind"] === "git" &&
        source["url"] === `https://github.com/${vendor.source}.git` &&
        source["ref"] === undefined &&
        source["subdir"] === undefined;
    if (!matchesSource) {
      throw new Error(
        `Source conflict for ${vendor.name}; expected ${vendor.source}. Existing snapshot left untouched.`,
      );
    }
    if (vendor.staged) {
      await validateStage(config, vendor.name);
    }
    console.log(
      `Skip ${vendor.name} (healthy managed snapshot, ${entry["enabled"] ? "enabled" : "disabled"})`,
    );
  });
  return pending;
}
async function validatePending(config: string, pending: Vendor[]) {
  await sequence(pending, async (vendor) => {
    if (vendor.staged) {
      const cache = path.join(config, "setup-sources", vendor.name);
      await validateRefresh(cache);
      if (await stat(cache)) {
        await validateStage(config, vendor.name);
      }
    }
  });
  const stageParent = await stat(path.join(config, "setup-sources"));
  if (stageParent && (!stageParent.isDirectory() || stageParent.isSymbolicLink())) {
    throw new Error("setup-sources must be a regular owned directory");
  }
}
async function validateAllStages(config: string) {
  await validatePending(config, [...VENDORS]);
}
export { pendingVendors, validatePending, validateAllStages };
