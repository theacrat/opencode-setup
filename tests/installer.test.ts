// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { spawn } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { createRequire } from "node:module";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { tmpdir } from "node:os";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { pathToFileURL } from "node:url";

import { parse } from "jsonc-parser";
import { afterEach, expect, test } from "vitest";

import native from "./native.ts";
import runProcess from "./process.ts";

const { probeSkills, sequence, waitForExit, waitForUrl } = native;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value: unknown, label: string) {
  if (!isObject(value)) {
    throw new TypeError(label);
  }
  return value;
}
function readConfig(text: string) {
  const value: unknown = parse(text);
  return object(value, "test configuration");
}

function referenceFor(kind: string, directory: string): string {
  if (kind === "file") {
    return pathToFileURL(directory).href;
  }
  if (kind === "relative") {
    return `..${path.sep}${path.basename(directory)}`;
  }
  if (kind === "local" || kind === "absolute") {
    return directory;
  }
  return kind;
}
function installedSource(config: string, vendor: { name: string; source: string }): string {
  if (vendor.name === "pstack") {
    return path.join(config, "setup-sources/pstack/checkout/pstack");
  }
  if (vendor.name === "mattpocock-skills") {
    return path.join(config, "setup-sources/mattpocock-skills/checkout");
  }
  return vendor.source;
}
const roots: string[] = [];
const vendors = [
  { name: "1password", source: "1Password/cursor-plugin" },
  { name: "cloudflare", source: "cloudflare/skills" },
  { name: "pstack", source: "theacrat/pstack-generic", subdir: "pstack" },
  { name: "mattpocock-skills", source: "mattpocock/skills" },
];
async function gitFixture(args: string[]) {
  const result = await runProcess("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
}
async function put(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function fixture({ npm = false, relocated = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-setup test "));
  roots.push(root);
  let installer = path.resolve("src/cli.ts");
  if (relocated) {
    const setup = path.join(root, "setup");
    await cp(path.resolve("src"), path.join(setup, "src"), { recursive: true });
    await cp(path.resolve("skills"), path.join(setup, "skills"), { recursive: true });
    await symlink(
      path.resolve("node_modules"),
      path.join(setup, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    installer = path.join(setup, "src/cli.ts");
  }
  const adapter = path.join(root, "adapter checkout");
  const config = path.join(root, "target config");
  const upstream = path.join(root, "pstack-upstream");
  const matt = path.join(root, "matt-upstream");
  const replacements: Record<string, string> = {
    "https://github.com/mattpocock/skills.git": matt,
    "https://github.com/theacrat/pstack-generic.git": upstream,
  };
  const nativeSources = [
    { directories: ["skills/frontend-design"], repository: "anthropics/skills" },
    {
      directories: [
        "skills/web-design-guidelines",
        "skills/react-best-practices",
        "skills/composition-patterns",
      ],
      repository: "vercel-labs/agent-skills",
    },
    {
      directories: [
        "plugins/property-based-testing/skills/property-based-testing",
        "plugins/mutation-testing/skills/mutation-testing",
        "plugins/sharp-edges/skills/sharp-edges",
      ],
      repository: "trailofbits/skills",
    },
  ];
  await sequence(nativeSources, async (source) => {
    const checkout = path.join(root, source.repository.split("/")[0] ?? "upstream");
    await sequence(source.directories, async (directory) => {
      const name = path.basename(directory);
      await put(
        path.join(checkout, directory, "SKILL.md"),
        `---\nname: ${name}\ndescription: Fixture skill\n---\nRead references/rules.md`,
      );
      await put(path.join(checkout, directory, "references/rules.md"), "Full resources");
    });
    await put(path.join(checkout, "LICENSE"), "Fixture licence");
    await writeFile(path.join(checkout, "binary.dat"), Buffer.from([0, 255, 10, 13, 32]));
    await put(path.join(checkout, "skills/unselected/SKILL.md"), "Unselected");
    await gitFixture(["init", checkout]);
    await gitFixture(["-C", checkout, "add", "."]);
    await gitFixture([
      "-C",
      checkout,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    replacements[`https://github.com/${source.repository}.git`] = checkout;
  });
  await sequence(
    vendors.filter((vendor) => !["pstack", "mattpocock-skills"].includes(vendor.name)),
    async (vendor) => {
      const source = path.join(root, vendor.name);
      await put(
        path.join(source, ".claude-plugin/plugin.json"),
        JSON.stringify({ name: vendor.name, version: "1.0.0" }),
      );
      await gitFixture(["init", source]);
      await gitFixture(["-C", source, "add", "."]);
      await gitFixture([
        "-C",
        source,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-m",
        "fixture",
      ]);
      replacements[`https://github.com/${vendor.source}.git`] = source;
    },
  );
  await put(
    path.join(matt, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "mattpocock-skills", version: "1.0.0" }),
  );
  await put(path.join(matt, "AGENTS.md"), "CLAUDE.md");
  await put(path.join(matt, "CLAUDE.md"), "Matt instructions");
  await gitFixture(["init", matt]);
  await gitFixture(["-C", matt, "add", "."]);
  await gitFixture([
    "-C",
    matt,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  const processResult1 = await runProcess(
    process.platform === "win32" ? "where" : "which",
    ["git"],
    {
      encoding: "utf8",
    },
  );
  const [gitBinary] = processResult1.stdout.trim().split(/\r?\n/u);
  const wrapper = path.join(root, "git-wrapper.ts");
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await put(
    wrapper,
    `import {spawnSync} from 'node:child_process';
 if(${JSON.stringify(path.join(root, "no-network"))} && require('node:fs').existsSync(${JSON.stringify(path.join(root, "no-network"))})) { console.error('Git retrieval forbidden'); process.exit(1); }
const replacements = ${JSON.stringify(replacements)};
const result=spawnSync(${JSON.stringify(gitBinary)},process.argv.slice(2).map(arg=>replacements[arg]??arg),{stdio:'inherit',env:process.env});
process.exit(result.status??1);`,
  );
  const built = await runProcess(
    "bun",
    [
      "build",
      "--compile",
      wrapper,
      "--outfile",
      path.join(bin, process.platform === "win32" ? "git.exe" : "git"),
    ],
    { encoding: "utf8" },
  );
  if (built.status !== 0) {
    throw new Error(built.stderr);
  }
  await put(
    path.join(upstream, "pstack/plugin.json"),
    JSON.stringify({ description: "Invalid root", name: "pstack" }),
  );
  await put(
    path.join(upstream, "pstack/.claude-plugin/plugin.json"),
    JSON.stringify({ name: "pstack", version: "1.0.0" }),
  );
  await put(path.join(upstream, "pstack/skills/probe/SKILL.md"), "Pstack resources");
  await gitFixture(["init", upstream]);
  await gitFixture(["-C", upstream, "add", "."]);
  await gitFixture([
    "-C",
    upstream,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  await put(path.join(adapter, "package.json"), JSON.stringify({ name: "oc-agent-plugins" }));
  await put(path.join(adapter, "index.ts"), "export {};");
  await put(
    path.join(adapter, "dist/cli.js"),
    `const fs = require('node:fs');
const p = require('node:path');
const args = process.argv.slice(2);
const root = process.env["OPENCODE_CONFIG_DIR"];
const file = p.join(root, 'inventory.json');
const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
if (args[0] === 'install') {
  if (process.env["SETUP_TEST_FAIL"] === args[1]) { console.error('fixture install failure'); process.exit(1); }
   const vendor = ${JSON.stringify(vendors)}.find(vendor => vendor.source === args[1]) || {name:args[1].includes('mattpocock-skills') ? 'mattpocock-skills' : 'pstack'};
  entries.push({ name: vendor.name, enabled: true, managed: true, receipt: { source: ['pstack','mattpocock-skills'].includes(vendor.name) ? {kind:'local',path:args[1]} : { kind: 'git', url: 'https://github.com/' + args[1] + '.git' } } });
  fs.mkdirSync(root, {recursive:true});
  fs.writeFileSync(file, JSON.stringify(entries));
  fs.appendFileSync(p.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
}
if (args[0] === 'update') {
  if (process.env['SETUP_TEST_AMBIGUOUS'] === args[1]) {
    entries.find(entry => entry.name === args[1]).receipt.changed = true;
    fs.writeFileSync(file, JSON.stringify(entries));
    console.error('fixture failure after commit'); process.exit(1);
  }
  if (process.env['SETUP_TEST_FAIL'] === args[1]) { console.error('fixture update failure'); process.exit(1); }
  fs.appendFileSync(p.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
}
console.log(JSON.stringify({entries}));`,
  );
  const invoke = async (args: string[] = [], env: Record<string, string> = {}) => {
    if (env["SETUP_TEST_NO_NETWORK"]) {
      await put(path.join(root, "no-network"), "forbidden");
    }
    return runProcess(
      "bun",
      [installer, ...(npm ? [] : ["--adapter", adapter]), "--config-dir", config, ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          HOME: root,
          PATH: `${bin}${path.delimiter}${process.env["PATH"]}`,
          USERPROFILE: root,
          XDG_CACHE_HOME: path.join(root, "cache"),
          XDG_CONFIG_HOME: path.join(root, "xdg-config"),
          XDG_DATA_HOME: path.join(root, "data"),
          XDG_STATE_HOME: path.join(root, "state"),
          ...env,
        },
      },
    );
  };
  return { adapter, config, invoke, replacements, root };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })),
  );
});

async function advance(
  source: string,
  file = "resources/new.md",
  content = "Fresh upstream bytes",
) {
  await put(path.join(source, file), content);
  await gitFixture(["-C", source, "add", "."]);
  await gitFixture([
    "-C",
    source,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "advance",
  ]);
}
async function snapshotFiles(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await sequence(await readdir(directory, { withFileTypes: true }), async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of Object.entries(await snapshotFiles(file))) {
        result[`${entry.name}/${name}`] = bytes;
      }
    } else if (entry.isFile()) {
      const bytes = await readFile(file);
      result[entry.name] = bytes.toString("base64");
    } else {
      result[entry.name] = await readlink(file);
    }
  });
  return result;
}
test("update pulls fresh native and all vendor revisions, resources and preserves disabled snapshots", async () => {
  const { config, invoke, replacements } = await fixture({ npm: true });
  const install = await invoke();
  expect(install.status).toBe(0);
  const before = await snapshotFiles(config);
  await sequence(Object.values(replacements), async (source) => {
    await advance(
      source,
      source.endsWith("pstack-upstream") ? "pstack/resources/new.md" : "resources/new.md",
    );
  });
  const adapterCli = createRequire(import.meta.url).resolve("oc-agent-plugins/package.json");
  await sequence(["cloudflare", "pstack"], async (name) => {
    const result = await runProcess(
      "node",
      [path.join(path.dirname(adapterCli), "dist/cli.js"), "disable", name, "--global", "--json"],
      { encoding: "utf8", env: { ...process.env, OPENCODE_CONFIG_DIR: config } },
    );
    expect(result.status).toBe(0);
  });
  const result = await invoke(["--update"]);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const files = await snapshotFiles(config);
  await sequence(Object.values(replacements), async (source) => {
    const revision = await runProcess("git", ["-C", source, "rev-parse", "HEAD"], {
      encoding: "utf8",
    });
    expect(
      Object.entries(files).some(
        ([file, bytes]) =>
          file.endsWith(".json") &&
          Buffer.from(bytes, "base64").toString().includes(revision.stdout.trim()),
      ),
    ).toBe(true);
  });
  await sequence(["anthropics", "vercel", "trailofbits"], async (name) => {
    expect(
      await readFile(
        path.join(config, "setup-native-sources", name, "checkout/resources/new.md"),
        "utf8",
      ),
    ).toBe("Fresh upstream bytes");
    expect(files[`setup-native-sources/${name}/source.json`]).not.toBe(
      before[`setup-native-sources/${name}/source.json`],
    );
  });
  for (const vendor of vendors) {
    const suffix = `${vendor.name}/resources/new.md`;
    expect(
      Object.entries(files).some(
        ([file, bytes]) =>
          file.includes("agent-plugins") &&
          file.endsWith(suffix) &&
          Buffer.from(bytes, "base64").toString() === "Fresh upstream bytes",
      ),
    ).toBe(true);
  }
  expect(files["setup-native-skills/thea-mode"]).toBe(before["setup-native-skills/thea-mode"]);
  const rerun = await invoke();
  expect(rerun.stdout).toContain("Skip pstack (healthy managed snapshot, disabled)");
  expect(rerun.stdout).toContain("Skip cloudflare (healthy managed snapshot, disabled)");
});
test("update dry-run fetches and writes nothing and interrupted journals fail closed", async () => {
  const { config, invoke, root } = await fixture({ npm: true });
  const install = await invoke();
  expect(install.status).toBe(0);
  await put(path.join(root, "no-network"), "forbidden");
  const before = await snapshotFiles(config);
  const result = await invoke(["--update", "--dry-run"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Would fetch mattpocock/skills into a fresh compatibility stage");
  expect(await snapshotFiles(config)).toEqual(before);
  await put(path.join(config, "setup-sources/pstack.update.json"), "retain generations");
  const blocked = await invoke(["--update"]);
  expect(blocked.status).toBe(1);
  expect(blocked.stderr).toContain("Interrupted source update");
  expect(await readFile(path.join(config, "setup-sources/pstack.update.json"), "utf8")).toBe(
    "retain generations",
  );
});
test("incompatible fresh compatibility source preserves every existing snapshot", async () => {
  const { config, invoke, replacements } = await fixture({ npm: true });
  const install = await invoke();
  expect(install.status).toBe(0);
  const before = await snapshotFiles(config);
  const source = replacements["https://github.com/mattpocock/skills.git"];
  if (!source) {
    throw new Error("Missing Matt fixture");
  }
  await advance(source, "AGENTS.md", "unexpected instructions");
  const result = await invoke(["--update"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("AGENTS.md link changed");
  expect(await snapshotFiles(config)).toEqual(before);
});
test("failed staged manager update restores old stage and keeps earlier native updates honestly", async () => {
  const { config, invoke, replacements } = await fixture();
  const install = await invoke();
  expect(install.status).toBe(0);
  const oldStage = await snapshotFiles(path.join(config, "setup-sources/pstack"));
  const inventory = await readFile(path.join(config, "inventory.json"), "utf8");
  await sequence(Object.values(replacements), async (source) => {
    await advance(source);
  });
  const result = await invoke(["--update"], { SETUP_TEST_FAIL: "pstack" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Partial setup; earlier successful updates");
  expect(await snapshotFiles(path.join(config, "setup-sources/pstack"))).toEqual(oldStage);
  expect(await readFile(path.join(config, "inventory.json"), "utf8")).toBe(inventory);
  expect(
    await readFile(
      path.join(config, "setup-native-sources/anthropics/checkout/resources/new.md"),
      "utf8",
    ),
  ).toBe("Fresh upstream bytes");
  const rerun = await invoke();
  expect(rerun.status).toBe(0);
});
test("update retrieval failure and edited installs are refused before publication", async () => {
  const { config, invoke, root } = await fixture({ npm: true });
  const install = await invoke();
  expect(install.status).toBe(0);
  const before = await snapshotFiles(config);
  await put(path.join(root, "no-network"), "forbidden");
  const retrieval = await invoke(["--update"]);
  expect(retrieval.status).toBe(1);
  expect(await snapshotFiles(config)).toEqual(before);
  await put(
    path.join(config, "setup-sources/pstack/checkout/pstack/skills/probe/SKILL.md"),
    "User edits",
  );
  const edited = await invoke(["--update"]);
  expect(edited.status).toBe(1);
  expect(edited.stderr).toContain("edited or unowned pstack stage");
  expect(
    await readFile(
      path.join(config, "setup-sources/pstack/checkout/pstack/skills/probe/SKILL.md"),
      "utf8",
    ),
  ).toBe("User edits");
});
test("cache notes and an active update lock are preserved and refused before retrieval", async () => {
  const { config, invoke, root } = await fixture({ npm: true });
  const install = await invoke();
  expect(install.status).toBe(0);
  await put(path.join(root, "no-network"), "forbidden");
  await put(path.join(config, "setup-sources/pstack/notes.txt"), "User notes");
  const before = await snapshotFiles(config);
  const result = await invoke(["--update"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unexpected source cache entry");
  expect(await snapshotFiles(config)).toEqual(before);
  await put(path.join(config, "setup-update.lock"), "unknown process");
  const locked = await invoke(["--update", "--dry-run"]);
  expect(locked.status).toBe(1);
  expect(locked.stderr).toContain("already running or interrupted");
  expect(await readFile(path.join(config, "setup-update.lock"), "utf8")).toBe("unknown process");
});
test("ambiguous manager failure retains both source generations and refuses a retry", async () => {
  const { config, invoke, replacements } = await fixture();
  const install = await invoke();
  expect(install.status).toBe(0);
  const source = replacements["https://github.com/theacrat/pstack-generic.git"];
  if (!source) {
    throw new Error("Missing pstack fixture");
  }
  await advance(source, "pstack/resources/new.md");
  const result = await invoke(["--update"], { SETUP_TEST_AMBIGUOUS: "pstack" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Manager outcome changed despite failure");
  const journalText = await readFile(path.join(config, "setup-sources/pstack.update.json"), "utf8");
  const journal = object(JSON.parse(journalText), "update journal");
  expect(typeof journal["backup"]).toBe("string");
  if (typeof journal["backup"] !== "string") {
    throw new TypeError("Missing backup path");
  }
  expect(
    await readFile(
      path.join(journal["backup"], "previous/checkout/pstack/skills/probe/SKILL.md"),
      "utf8",
    ),
  ).toBe("Pstack resources");
  expect(
    await readFile(
      path.join(config, "setup-sources/pstack/checkout/pstack/resources/new.md"),
      "utf8",
    ),
  ).toBe("Fresh upstream bytes");
  const retry = await invoke(["--update"]);
  expect(retry.status).toBe(1);
  expect(retry.stderr).toContain("Interrupted source update");
});
test.each(["agent-plugins", ".agent-plugins-disabled"])(
  "update refuses a regular-file vendor target in %s before fetching",
  async (store) => {
    const { config, invoke, root } = await fixture({ npm: true });
    await put(path.join(root, "no-network"), "forbidden");
    const file = path.join(config, store, "cloudflare");
    await put(file, "User content");
    const before = await snapshotFiles(config);
    const result = await invoke(["--update"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Conflicting vendor target");
    expect(await snapshotFiles(config)).toEqual(before);
  },
);

test("npm default invokes the published manager without downloads or dry-run writes", async () => {
  const { root, config, invoke } = await fixture({ npm: true });
  await put(path.join(root, "no-network"), "forbidden");
  const before = await readdir(root);
  const result = await invoke(["--dry-run"], {
    SETUP_TEST_NO_NETWORK: "1",
    npm_config_offline: "true",
    npm_config_registry: "http://127.0.0.1:1",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Would register oc-agent-plugins@0.2.2");
  expect(result.stdout).toContain("Install cloudflare/skills");
  expect(await readdir(root)).toEqual(before);
  await expect(readFile(path.join(config, "opencode.jsonc"))).rejects.toThrow();
});

test.each(["oc-agent-plugins", "oc-agent-plugins@0.1.0", "local", "file", "relative"])(
  "npm default migrates %s registration and preserves object options and comments",
  async (kind) => {
    const { adapter, config, invoke } = await fixture({ npm: true });
    const reference = referenceFor(kind, adapter);
    const file = path.join(config, "opencode.jsonc");
    await put(
      file,
      `{\n // retained\n "plugins": [{"package": ${JSON.stringify(reference)}, "options": {"components": {"mcp": false}}}]\n}\n`,
    );
    const result = await invoke();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const text = await readFile(file, "utf8");
    expect(text).toContain("// retained");
    expect(readConfig(text)["plugins"]).toEqual([
      { options: { components: { mcp: false } }, package: "oc-agent-plugins@0.2.2" },
    ]);
    const rerun = await invoke();
    expect(rerun.status).toBe(0);
    expect(rerun.stdout).toContain("Skip cloudflare");
    expect(await readFile(file, "utf8")).toBe(text);
  },
);

test("npm default rejects duplicate npm/local registrations before writing", async () => {
  const { adapter, config, invoke } = await fixture({ npm: true });
  const file = path.join(config, "opencode.jsonc");
  const original = JSON.stringify({ plugins: ["oc-agent-plugins", adapter] });
  await put(file, original);
  const result = await invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("registered more than once");
  expect(await readFile(file, "utf8")).toBe(original);
});

test.each(["absolute", "file", "relative"])(
  "npm default migrates the missing former sibling via %s without adopting arbitrary missing paths",
  async (kind) => {
    const { root, config, invoke } = await fixture({ npm: true, relocated: true });
    const old = path.join(root, "opencode-agent-plugins");
    const reference = referenceFor(kind, old);
    const unrelated = path.join(root, "missing-other-plugin");
    const file = path.join(config, "opencode.jsonc");
    await put(
      file,
      JSON.stringify({
        plugins: [unrelated, { options: { components: { mcp: false } }, package: reference }],
      }),
    );
    const result = await invoke();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(readConfig(await readFile(file, "utf8"))["plugins"]).toEqual([
      unrelated,
      { options: { components: { mcp: false } }, package: "oc-agent-plugins@0.2.2" },
    ]);
    await expect(readFile(path.join(old, "package.json"))).rejects.toThrow();
  },
);

test("npm default preserves an unrelated package at the former sibling location", async () => {
  const { root, config, invoke } = await fixture({ npm: true, relocated: true });
  const unrelated = path.join(root, "opencode-agent-plugins");
  await put(path.join(unrelated, "package.json"), JSON.stringify({ name: "unrelated-plugin" }));
  const file = path.join(config, "opencode.jsonc");
  await put(file, JSON.stringify({ plugins: [unrelated, "oc-agent-plugins"] }));
  const result = await invoke();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(readConfig(await readFile(file, "utf8"))["plugins"]).toEqual([
    unrelated,
    "oc-agent-plugins@0.2.2",
  ]);
});

test("npm default adds the pinned string registration without adopting unrelated local plugins", async () => {
  const { root, config, invoke } = await fixture({ npm: true });
  const unrelated = path.join(root, "unrelated");
  await put(path.join(unrelated, "package.json"), JSON.stringify({ name: "other-plugin" }));
  const file = path.join(config, "opencode.jsonc");
  await put(file, JSON.stringify({ plugins: [unrelated] }));
  const first = await invoke();
  expect(first.stderr).toBe("");
  expect(first.status).toBe(0);
  expect(readConfig(await readFile(file, "utf8"))["plugins"]).toEqual([
    unrelated,
    "oc-agent-plugins@0.2.2",
  ]);
  await put(file, JSON.stringify({ plugins: ["oc-agent-plugins@0.1.0"] }));
  const invocationResult2 = await invoke();
  expect(invocationResult2.status).toBe(0);
  expect(readConfig(await readFile(file, "utf8"))["plugins"]).toEqual(["oc-agent-plugins@0.2.2"]);
});

test("installs exact vendors, keeps comments/options and aliases with full resources, reruns without writes", async () => {
  const { adapter, config, invoke } = await fixture();
  const file = path.join(config, "opencode.jsonc");
  await put(
    file,
    `{\n // keep this comment\n "model": "test/model",\n "plugins": [{"package":${JSON.stringify(adapter)}, "options":{"components":{"mcp":false},"formats":{"codex":false}}}],\n "skills": ["existing"],\n "permissions": [{"effect":"deny","action":"shell","resource":"*"}],\n}\n`,
  );
  const first = await invoke();
  expect(first.stderr).toBe("");
  expect(first.status).toBe(0);
  const text = await readFile(file, "utf8");
  expect(text).toContain("// keep this comment");
  const value = readConfig(text);
  expect(value["plugins"]).toEqual([
    {
      options: { components: { mcp: false }, formats: { codex: false } },
      package: adapter,
    },
  ]);
  expect(value["skills"]).toEqual(["existing", path.join(config, "setup-native-skills")]);
  const view = path.join(config, "setup-native-skills");
  const directoryEntries1 = await readdir(view);
  expect(directoryEntries1.toSorted()).toEqual([
    "frontend-design",
    "mutation-testing",
    "property-based-testing",
    "sharp-edges",
    "thea-mode",
    "vercel-composition-patterns",
    "vercel-react-best-practices",
    "web-design-guidelines",
  ]);
  expect(await realpath(path.join(view, "vercel-react-best-practices"))).toBe(
    await realpath(
      path.join(config, "setup-native-sources/vercel/checkout/skills/react-best-practices"),
    ),
  );
  expect(
    await readFile(path.join(view, "vercel-react-best-practices/references/rules.md"), "utf8"),
  ).toBe("Full resources");
  const fileText2 = await readFile(path.join(config, "calls.jsonl"), "utf8");
  const calls = fileText2
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  expect(calls).toEqual(
    vendors.map((vendor) => ["install", installedSource(config, vendor), "--global", "--json"]),
  );
  const invocationResult3 = await invoke([], { SETUP_TEST_NO_NETWORK: "1" });
  expect(invocationResult3.status).toBe(0);
  expect(await readFile(file, "utf8")).toBe(text);
  const callsAfter = await readFile(path.join(config, "calls.jsonl"), "utf8");
  expect(callsAfter.trim().split("\n")).toHaveLength(4);
});

test("dry-run does not create target or retrieve vendors", async () => {
  const { config, invoke } = await fixture();
  const result = await invoke(["--dry-run"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("No writes performed");
  await expect(readdir(config)).rejects.toThrow();
});

test("migrates only exact former sibling links after sources are ready, leaving the old tree intact", async () => {
  const { root, config, invoke } = await fixture({ relocated: true });
  const old = path.join(root, "ai-config/personal/skills/thea-mode");
  await put(path.join(old, "SKILL.md"), "Old personal content");
  const view = path.join(config, "setup-native-skills");
  await mkdir(view, { recursive: true });
  const link = path.join(view, "thea-mode");
  await symlink(old, link, process.platform === "win32" ? "junction" : "dir");
  const before = await readlink(link);
  const dry = await invoke(["--dry-run"]);
  expect(dry.status).toBe(0);
  expect(await readlink(link)).toBe(before);
  const installed = await invoke();
  expect(installed.status).toBe(0);
  expect(await realpath(link)).toBe(await realpath(path.join(root, "setup/skills/thea-mode")));
  expect(await readFile(path.join(old, "SKILL.md"), "utf8")).toBe("Old personal content");
  expect(await readFile(path.join(link, "references/typescript/tsconfig.json"), "utf8")).toBe(
    await readFile(path.resolve("skills/thea-mode/references/typescript/tsconfig.json"), "utf8"),
  );
});

test("rejects arbitrary old links before retrieving native sources", async () => {
  const { root, config, invoke } = await fixture();
  const view = path.join(config, "setup-native-skills");
  await mkdir(view, { recursive: true });
  const old = path.join(root, "arbitrary/personal/skills/thea-mode");
  await symlink(
    old,
    path.join(view, "thea-mode"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const failed = await invoke();
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("Conflicting native skill view entry");
  await expect(readdir(path.join(config, "setup-native-sources"))).rejects.toThrow();
});

test.skipIf(process.platform === "win32")(
  "materialises internal file links exactly and rejects escaping links before publishing",
  async () => {
    const { root, config, invoke } = await fixture();
    const upstream = path.join(root, "vercel-labs");
    await put(path.join(upstream, "AGENTS.md"), "Resource with trailing whitespace  \n");
    await symlink("AGENTS.md", path.join(upstream, "CLAUDE.md"));
    await gitFixture(["-C", upstream, "add", "."]);
    await gitFixture([
      "-C",
      upstream,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "link",
    ]);
    const installed = await invoke();
    expect(installed.status).toBe(0);
    const cache = path.join(config, "setup-native-sources/vercel");
    expect(await readFile(path.join(cache, "checkout/CLAUDE.md"), "utf8")).toBe(
      "Resource with trailing whitespace  \n",
    );
    expect(await readFile(path.join(cache, "checkout/binary.dat"))).toEqual(
      Buffer.from([0, 255, 10, 13, 32]),
    );
    const receiptText = await readFile(path.join(cache, "source.json"), "utf8");
    const receipt = object(JSON.parse(receiptText), "receipt");
    expect(receipt["materialisedLinks"]).toEqual([{ path: "CLAUDE.md", target: "AGENTS.md" }]);
  },
);

test.skipIf(process.platform === "win32")(
  "failed native retrieval preserves ready snapshots and legacy links, then resumes safely",
  async () => {
    const { root, config, invoke } = await fixture({ relocated: true });
    const upstream = path.join(root, "vercel-labs");
    await symlink("../outside", path.join(upstream, "escape"));
    await gitFixture(["-C", upstream, "add", "."]);
    await gitFixture([
      "-C",
      upstream,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "escape",
    ]);
    const view = path.join(config, "setup-native-skills");
    await mkdir(view, { recursive: true });
    const link = path.join(view, "thea-mode");
    const old = path.join(root, "ai-config/personal/skills/thea-mode");
    await symlink(old, link);
    const failed = await invoke();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("Partial setup");
    expect(await readlink(link)).toBe(old);
    await expect(
      readFile(path.join(config, "setup-native-sources/anthropics/source.json")),
    ).resolves.toBeDefined();
    await expect(readdir(path.join(config, "setup-native-sources/vercel"))).rejects.toThrow();
    await expect(readFile(path.join(config, "calls.jsonl"))).rejects.toThrow();
    await rm(path.join(upstream, "escape"));
    await gitFixture(["-C", upstream, "add", "."]);
    await gitFixture([
      "-C",
      upstream,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixed",
    ]);
    const resumed = await invoke();
    expect(resumed.status).toBe(0);
  },
);

test("stage digest rejects path-content boundary collisions", async () => {
  const { config, invoke } = await fixture();
  const invocationResult4 = await invoke();
  expect(invocationResult4.status).toBe(0);
  const source = path.join(config, "setup-sources/pstack/checkout/pstack");
  const first = path.join(source, ".claude-plugin/plugin.json");
  const second = path.join(source, "skills/probe/SKILL.md");
  const original = await readFile(first, "utf8");
  await writeFile(
    first,
    `${original}skillsskills/probeskills/probe/SKILL.md${await readFile(second, "utf8")}`,
  );
  await rm(path.join(source, "skills"), { recursive: true });
  const result = await invoke(["--dry-run"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("edited or unowned pstack stage");
});

test.skipIf(process.platform === "win32")(
  "stage digest distinguishes literal backslashes from directories",
  async () => {
    const { config, invoke } = await fixture();
    const invocationResult5 = await invoke();
    expect(invocationResult5.status).toBe(0);
    const source = path.join(config, "setup-sources/pstack/checkout/pstack");
    await mkdir(path.join(source, "a"));
    await writeFile(path.join(source, String.raw`a\b`), "X");
    const { fingerprint } = await import("@/staging.ts");
    const original = await fingerprint(source);
    await rm(path.join(source, String.raw`a\b`));
    await writeFile(path.join(source, "a", "b"), "X");
    expect(await fingerprint(source)).not.toBe(original);
  },
);

test("appends to arrays without removing their comments", async () => {
  const { config, invoke } = await fixture();
  const file = path.join(config, "opencode.jsonc");
  await put(
    file,
    '{"plugins":[\n// plugin comment\n"other-plugin"],"skills":[\n// skill comment\n"other-skill"]}',
  );
  const invocationResult6 = await invoke();
  expect(invocationResult6.status).toBe(0);
  const text = await readFile(file, "utf8");
  expect(text).toContain("// plugin comment");
  expect(text).toContain("// skill comment");
});

test("rejects edited or missing compatibility stage receipt without reinstalling snapshots", async () => {
  const { config, invoke } = await fixture();
  const invocationResult7 = await invoke();
  expect(invocationResult7.status).toBe(0);
  const calls = await readFile(path.join(config, "calls.jsonl"), "utf8");
  await put(
    path.join(config, "setup-sources/pstack/checkout/pstack/skills/probe/SKILL.md"),
    "Edited stage",
  );
  const failed = await invoke();
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("edited or unowned");
  expect(await readFile(path.join(config, "calls.jsonl"), "utf8")).toBe(calls);
});

test("preflights unowned stages even on dry-run before any vendor installations", async () => {
  const { config, invoke } = await fixture();
  await put(path.join(config, "setup-sources/mattpocock-skills/checkout/CLAUDE.md"), "Unowned");
  const invocationResult8 = await invoke(["--dry-run"]);
  expect(invocationResult8.status).toBe(1);
  const invocationResult9 = await invoke();
  expect(invocationResult9.status).toBe(1);
  await expect(readFile(path.join(config, "calls.jsonl"))).rejects.toThrow();
});

test.each(["malformed", "revision", "edited", "symlink", "hidden-git"])(
  "rejects invalid native snapshots without mutation: %s",
  async (kind) => {
    const { config, invoke } = await fixture();
    const installed = await invoke();
    expect(installed.status).toBe(0);
    const cache = path.join(config, "setup-native-sources/vercel");
    const receipt = path.join(cache, "source.json");
    const file = path.join(cache, "checkout/skills/react-best-practices/references/rules.md");
    if (kind === "malformed") {
      await writeFile(receipt, "{");
    } else if (kind === "revision") {
      const data = object(JSON.parse(await readFile(receipt, "utf8")), "receipt");
      await writeFile(receipt, JSON.stringify({ ...data, revision: "not-a-revision" }));
    } else if (kind === "edited") {
      await writeFile(file, "User edits");
    } else if (kind === "hidden-git") {
      await put(path.join(cache, "checkout/skills/.git/user-edit"), "Unexpected metadata");
    } else {
      await rm(file);
      await symlink(cache, file, process.platform === "win32" ? "junction" : "dir");
    }
    const before = await readFile(path.join(config, "calls.jsonl"), "utf8");
    const dry = await invoke(["--dry-run"], { SETUP_TEST_NO_NETWORK: "1" });
    expect(dry.status).toBe(1);
    const failed = await invoke();
    expect(failed.status).toBe(1);
    expect(await readFile(path.join(config, "calls.jsonl"), "utf8")).toBe(before);
  },
);

test.each(["opencode.json", "opencode.jsonc"])(
  "validates both config files before mutations: %s",
  async (name) => {
    const { config, invoke } = await fixture();
    await put(path.join(config, name), "{ broken");
    await put(
      path.join(config, name === "opencode.json" ? "opencode.jsonc" : "opencode.json"),
      "{}",
    );
    const result = await invoke();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Malformed JSON/JSONC");
    const directoryEntries4 = await readdir(config);
    expect(directoryEntries4.toSorted()).toEqual(["opencode.json", "opencode.jsonc"]);
  },
);

test.each(["edited", "unmanaged", "source", "disabled"])("receipt safety: %s", async (kind) => {
  const { config, invoke } = await fixture();
  const entry = {
    enabled: false,
    managed: kind !== "unmanaged",
    name: "1password",
    ...(kind === "edited" ? { problem: "edited" } : {}),
    receipt: {
      source: {
        kind: "git",
        url:
          kind === "source"
            ? "https://github.com/other/source.git"
            : "https://github.com/1Password/cursor-plugin.git",
      },
    },
  };
  const file = path.join(config, "inventory.json");
  await put(file, JSON.stringify([entry]));
  const result = await invoke(["--dry-run"]);
  expect(result.status).toBe(kind === "disabled" ? 0 : 1);
  if (kind === "disabled") {
    expect(result.stdout).toContain("disabled");
  }
  expect(await readFile(file, "utf8")).toBe(JSON.stringify([entry]));
});

test("fails honestly after partial vendor installation and rerun resumes", async () => {
  const { config, invoke } = await fixture();
  const failed = await invoke([], { SETUP_TEST_FAIL: "cloudflare/skills" });
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("Partial setup");
  await expect(readFile(path.join(config, "opencode.jsonc"))).rejects.toThrow();
  const invocationResult12 = await invoke();
  expect(invocationResult12.status).toBe(0);
  const fileText5 = await readFile(path.join(config, "calls.jsonl"), "utf8");
  expect(fileText5.trim().split("\n")).toHaveLength(4);
});

test("preserves explicit format options and rejects conflicting native view without mutations", async () => {
  const { adapter, config, invoke } = await fixture();
  await put(
    path.join(config, "opencode.json"),
    JSON.stringify({
      plugins: [{ options: { formats: { "agent-plugins": true } }, package: adapter }],
    }),
  );
  const invocationResult13 = await invoke(["--dry-run"]);
  expect(invocationResult13.status).toBe(0);
  await put(path.join(config, "opencode.json"), "{}");
  await put(
    path.join(config, "setup-native-skills/vercel-react-best-practices/SKILL.md"),
    "Unmanaged",
  );
  const invocationResult14 = await invoke();
  expect(invocationResult14.stderr).toContain("Conflicting native skill view entry");
  await expect(readFile(path.join(config, "inventory.json"))).rejects.toThrow();
});

test("help succeeds without checkouts and invalid arguments fail", async () => {
  const help = await runProcess("bun", [path.resolve("src/cli.ts"), "--help"], {
    encoding: "utf8",
  });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("--dry-run");
  const bad = await runProcess("bun", [path.resolve("src/cli.ts"), "--unknown"], {
    encoding: "utf8",
  });
  expect(bad.status).toBe(1);
  expect(bad.stderr).toContain("Unknown argument");
});

test("real manager installs local snapshots safely and rejects malformed higher-priority pstack manifests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-manager integration "));
  roots.push(root);
  const config = path.join(root, "config");
  const source = path.join(root, "source");
  await put(
    path.join(source, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }),
  );
  await put(
    path.join(source, "skills/probe/SKILL.md"),
    "---\nname: probe\ndescription: Probe\n---\nProbe",
  );
  const cli = process.env["ADAPTER_TEST_DIR"]
    ? path.resolve(process.env["ADAPTER_TEST_DIR"], "dist/cli.js")
    : path.join(
        path.dirname(createRequire(import.meta.url).resolve("oc-agent-plugins/package.json")),
        "dist/cli.js",
      );
  const call = async (args: string[]) =>
    runProcess("node", [cli, ...args, "--global", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, OPENCODE_CONFIG_DIR: config },
    });
  const operationResult15 = await call(["install", source]);
  expect(operationResult15.status).toBe(0);
  const listResult = await call(["list"]);
  const inventory = object(JSON.parse(listResult.stdout), "inventory");
  const first = object(
    Array.isArray(inventory["entries"]) ? inventory["entries"][0] : undefined,
    "entry",
  );
  expect(first["name"]).toBe("fixture");
  expect(first["managed"]).toBe(true);
  expect(first["problem"]).toBeUndefined();
  await put(path.join(config, "agent-plugins/fixture/skills/probe/SKILL.md"), "Edited");
  const operationResult16 = await call(["update", "fixture"]);
  expect(operationResult16.status).toBe(1);
  expect(
    await readFile(path.join(config, "agent-plugins/fixture/skills/probe/SKILL.md"), "utf8"),
  ).toBe("Edited");
  const pstack = path.join(root, "pstack");
  await put(
    path.join(pstack, "plugin.json"),
    JSON.stringify({ description: "Invalid root takes priority", name: "pstack" }),
  );
  await put(
    path.join(pstack, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "pstack", version: "1.0.0" }),
  );
  const failed = await call(["install", pstack]);
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("$schema is missing or not a string");
  await expect(readFile(path.join(config, "agent-plugins/pstack/plugin.json"))).rejects.toThrow();
});

test.skipIf(!process.env["OPENCODE_TEST_BINARY"])(
  "native V2 discovers only selected aliases through the skill view",
  async () => {
    const { root, config, invoke } = await fixture();
    const invocationResult17 = await invoke();
    expect(invocationResult17.status).toBe(0);
    await put(
      path.join(config, "opencode.jsonc"),
      JSON.stringify({ skills: [path.join(config, "setup-native-skills")] }),
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: root,
      OPENCODE_CONFIG_DIR: config,
      USERPROFILE: root,
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "xdg-config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_STATE_HOME: path.join(root, "state"),
    };
    delete env["OPENCODE_CONFIG"];
    delete env["OPENCODE_CONFIG_CONTENT"];
    delete env["OPENCODE_HOST"];
    const binary = process.env["OPENCODE_TEST_BINARY"] ?? "opencode";
    const child = spawn(binary, ["serve", "--stdio", "--port", "0"], {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = waitForExit(child);
    try {
      const url = await waitForUrl(child);
      const { ids, lastResponse } = await probeSkills(binary, url, root, env);
      expect(
        ids.filter((id) => id !== "opencode" && id !== "report").toSorted(),
        lastResponse,
      ).toEqual([
        "frontend-design",
        "mutation-testing",
        "property-based-testing",
        "sharp-edges",
        "thea-mode",
        "vercel-composition-patterns",
        "vercel-react-best-practices",
        "web-design-guidelines",
      ]);
    } finally {
      child.kill();
      await exited;
    }
  },
  45_000,
);
