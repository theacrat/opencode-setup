// oxlint-disable-next-line import/no-nodejs-modules -- Assert native platform path precedence independently of the installer.
import { homedir } from "node:os";
// oxlint-disable-next-line import/no-nodejs-modules -- Expected paths must be portable across the CI OS matrix.
import path from "node:path";

import { expect, test } from "vitest";

import { configPath } from "@/config-path.ts";

test.each([
  { env: {}, expected: path.join(homedir(), ".config", "opencode") },
  {
    env: { OPENCODE_CONFIG_DIR: "", XDG_CONFIG_HOME: "" },
    expected: path.join(homedir(), ".config", "opencode"),
  },
  {
    env: { OPENCODE_CONFIG_DIR: "", XDG_CONFIG_HOME: "xdg" },
    expected: path.resolve("xdg", "opencode"),
  },
  {
    env: { OPENCODE_CONFIG_DIR: "explicit", XDG_CONFIG_HOME: "xdg" },
    expected: path.resolve("explicit"),
  },
])("configuration environment precedence: $env", ({ env, expected }) => {
  expect(configPath(undefined, env)).toBe(expected);
  expect(configPath("flag", env)).toBe(path.resolve("flag"));
});
