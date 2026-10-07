// oxlint-disable-next-line import/no-nodejs-modules -- Isolated native filesystem regression fixture.
import { mkdtemp, readFile, rm, symlink, writeFile, lstat } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- Use the platform's isolated temporary directory.
import { tmpdir } from "node:os";
// oxlint-disable-next-line import/no-nodejs-modules -- Regression fixture paths must support all CI platforms.
import path from "node:path";

import { expect, test } from "vitest";

import { writeConfiguration } from "@/configuration.ts";

test.skipIf(process.platform === "win32")(
  "configuration replaced by a symlink during setup is retained unchanged",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "setup-config-race-"));
    try {
      const source = path.join(root, "unrelated.jsonc");
      const file = path.join(root, "opencode.jsonc");
      await writeFile(source, "{}\n");
      await symlink(source, file);
      await expect(
        writeConfiguration({ file, original: "{}\n", value: {} }, '{"plugins": []}\n'),
      ).rejects.toThrow("regular file");
      expect(await readFile(source, "utf8")).toBe("{}\n");
      const info = await lstat(file);
      expect(info.isSymbolicLink()).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
