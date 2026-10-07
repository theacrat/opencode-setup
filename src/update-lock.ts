// oxlint-disable-next-line import/no-nodejs-modules -- Source refresh uses an exclusive filesystem lock.
import { mkdir, unlink, writeFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- Lock paths use platform separators.
import path from "node:path";

import { stat } from "./filesystem.ts";

async function validateUpdateLock(config: string) {
  const file = path.join(config, "setup-update.lock");
  if (await stat(file)) {
    throw new Error(
      `Source update already running or interrupted: ${file}. Recover explicitly after inspecting the process and journals.`,
    );
  }
}
async function withUpdateLock(config: string, apply: () => Promise<void>) {
  await mkdir(config, { recursive: true });
  const file = path.join(config, "setup-update.lock");
  await writeFile(file, String(process.pid), { flag: "wx", mode: 0o600 });
  try {
    await apply();
  } finally {
    await unlink(file);
  }
}
export { validateUpdateLock, withUpdateLock };
