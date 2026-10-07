import { manager } from "./adapter.ts";
import { stat } from "./filesystem.ts";
import { pendingVendors } from "./inventory.ts";
import { acquireNative, validateSnapshot } from "./native-skills.ts";
import { SOURCES } from "./native-sources.ts";
import type { NativeSource } from "./native-sources.ts";
import type { Environment } from "./platform.ts";
import { discardReplacement, publishReplacement, RecoveryRequiredError } from "./refresh.ts";
import type { Replacement } from "./refresh.ts";
import { sequence } from "./sequence.ts";
import { acquireStage, stagedSource, validateStage } from "./staging.ts";
import { VENDORS } from "./vendors.ts";

interface NativeReplacement {
  source: NativeSource;
  replacement: Replacement;
}

async function acquireReplacements(
  config: string,
  env: Environment,
  replacements: Replacement[],
  natives: NativeReplacement[],
  stages: Map<string, Replacement>,
) {
  await sequence(SOURCES, async (source) => {
    const replacement = await acquireNative(config, source, env);
    replacements.push(replacement);
    natives.push({ replacement, source });
  });
  await sequence(VENDORS, async (vendor) => {
    if (vendor.staged) {
      const replacement = await acquireStage(config, vendor.name, env);
      replacements.push(replacement);
      stages.set(vendor.name, replacement);
    }
  });
}
async function updateManaged(cli: string, config: string, args: string[], env: Environment) {
  const before = await manager(cli, config, ["list"], env);
  try {
    await manager(cli, config, args, env);
  } catch (error) {
    let after;
    try {
      await pendingVendors(cli, config, env);
      after = await manager(cli, config, ["list"], env);
    } catch (inspectionError) {
      throw new RecoveryRequiredError(
        `Manager outcome uncertain; retain source update journal and recover explicitly. ${String(inspectionError)}`,
      );
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new RecoveryRequiredError(
        "Manager outcome changed despite failure; retain source update journal and recover explicitly.",
      );
    }
    throw error;
  }
}
async function publishNatives(
  config: string,
  natives: NativeReplacement[],
  replacements: Replacement[],
) {
  await sequence(natives, async ({ source, replacement }) => {
    await publishReplacement(
      replacement,
      async () => {
        await stat(replacement.cache);
      },
      async () => {
        if (await stat(replacement.cache)) {
          await validateSnapshot(config, source);
        }
      },
    );
    replacements.splice(replacements.indexOf(replacement), 1);
    console.log(`Updated native ${replacement.cache}`);
  });
}
async function pullSources(
  cli: string,
  config: string,
  env: Environment,
  missing: readonly string[],
) {
  const replacements: Replacement[] = [];
  const natives: NativeReplacement[] = [];
  const stages = new Map<string, Replacement>();
  try {
    await acquireReplacements(config, env, replacements, natives, stages);
    await publishNatives(config, natives, replacements);
    await sequence(VENDORS, async (vendor) => {
      const apply = async () => {
        await updateManaged(
          cli,
          config,
          missing.includes(vendor.name)
            ? ["install", vendor.staged ? stagedSource(config, vendor.name) : vendor.source]
            : ["update", vendor.name],
          env,
        );
      };
      const replacement = stages.get(vendor.name);
      if (replacement) {
        await publishReplacement(replacement, apply, async () => {
          if (vendor.staged && (await stat(replacement.cache))) {
            await validateStage(config, vendor.name);
          }
        });
        replacements.splice(replacements.indexOf(replacement), 1);
      } else {
        await apply();
      }
    });
  } finally {
    await sequence(replacements, discardReplacement);
  }
}
function reportUpdates() {
  for (const source of SOURCES) {
    console.log(`Would fetch native ${source.repository}. No retrieval performed.`);
  }
  for (const vendor of VENDORS) {
    console.log(
      `Would fetch ${vendor.source}${vendor.staged ? " into a fresh compatibility stage before managed update" : " through managed update"}. No retrieval performed.`,
    );
  }
}
export { pullSources, reportUpdates };
export { validateUpdateLock, withUpdateLock } from "./update-lock.ts";
