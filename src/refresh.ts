// oxlint-disable-next-line import/no-nodejs-modules -- Owned source refresh requires native filesystem operations.
import { lstat, mkdir, mkdtemp, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- Owned source paths use platform separators.
import path from "node:path";

import { stat } from "./filesystem.ts";

interface Replacement {
  cache: string;
  scratch: string;
}
class RecoveryRequiredError extends Error {
  public override name = "RecoveryRequiredError";
}
function journalFor(cache: string): string {
  return `${cache}.update.json`;
}
async function validateRefresh(cache: string): Promise<void> {
  if (await stat(journalFor(cache))) {
    throw new Error(
      `Interrupted source update: ${journalFor(cache)}. Inspect the recorded paths and recover explicitly before retrying; nothing will be overwritten.`,
    );
  }
}
async function validateLayout(cache: string, entries: readonly string[]) {
  if (await stat(cache)) {
    for (const name of await readdir(cache)) {
      if (!entries.includes(name)) {
        throw new Error(
          `Unexpected source cache entry: ${path.join(cache, name)}. Preserve it and move it aside deliberately.`,
        );
      }
    }
  }
}
async function discardReplacement(replacement: Replacement): Promise<void> {
  if (!(await stat(journalFor(replacement.cache))) && (await stat(replacement.scratch))) {
    await rm(replacement.scratch, { recursive: true });
  }
}
async function finishBackup(backup: string, existed: boolean) {
  if (existed) {
    console.log(`Previous source generation retained at ${path.join(backup, "previous")}`);
  } else {
    await rm(backup, { recursive: true });
  }
}
async function publishReplacement(
  replacement: Replacement,
  apply: () => Promise<void>,
  validate: () => Promise<void>,
): Promise<void> {
  const { cache, scratch } = replacement;
  await validateRefresh(cache);
  await mkdir(path.dirname(cache), { recursive: true });
  const parent = await lstat(path.dirname(cache));
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    throw new Error(`Unsafe refresh parent: ${path.dirname(cache)}`);
  }
  const backup = await mkdtemp(path.join(path.dirname(cache), ".update-backup-"));
  const previous = path.join(backup, "previous");
  const existed = (await stat(cache)) !== undefined;
  const journal = journalFor(cache);
  await writeFile(journal, JSON.stringify({ backup, cache, existed, scratch }), {
    flag: "wx",
    mode: 0o600,
  });
  let moved = false;
  let published = false;
  try {
    await validate();
    if (existed) {
      await rename(cache, previous);
      moved = true;
    }
    await rename(scratch, cache);
    published = true;
    await apply();
  } catch (error) {
    if (error instanceof RecoveryRequiredError) {
      throw error;
    }
    if (published) {
      await rename(cache, scratch);
    }
    if (moved) {
      await rename(previous, cache);
    }
    await unlink(journal);
    await rm(backup, { recursive: true });
    throw error;
  }
  await finishBackup(backup, existed);
  await unlink(journal);
}

export {
  discardReplacement,
  publishReplacement,
  RecoveryRequiredError,
  validateLayout,
  validateRefresh,
};
export type { Replacement };
