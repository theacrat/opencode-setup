import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, test } from "vitest";
import { parse } from "jsonc-parser";

const roots: string[] = [];
const vendors = [
  { name: "1password", source: "1Password/cursor-plugin" },
  { name: "cloudflare", source: "cloudflare/skills" },
  { name: "pstack", source: "theacrat/pstack-generic", subdir: "pstack" },
  { name: "mattpocock-skills", source: "mattpocock/skills" },
];
function gitFixture(args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}
async function put(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function fixture(npm = false, relocated = false) {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-setup test "));
  roots.push(root);
  let installer = path.resolve("src/cli.ts");
  if (relocated) {
    const setup = path.join(root, "setup");
    await cp(path.resolve("src"), path.join(setup, "src"), { recursive: true });
    await symlink(
      path.resolve("node_modules"),
      path.join(setup, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    installer = path.join(setup, "src/cli.ts");
  }
  const adapter = path.join(root, "adapter checkout");
  const ai = path.join(root, "ai config");
  const config = path.join(root, "target config");
  const upstream = path.join(root, "pstack-upstream");
  const matt = path.join(root, "matt-upstream");
  const replacements: Record<string, string> = {
    "https://github.com/theacrat/pstack-generic.git": upstream,
    "https://github.com/mattpocock/skills.git": matt,
  };
  for (const vendor of vendors.filter(
    (vendor) => !["pstack", "mattpocock-skills"].includes(vendor.name),
  )) {
    const source = path.join(root, vendor.name);
    await put(
      path.join(source, ".claude-plugin/plugin.json"),
      JSON.stringify({ name: vendor.name, version: "1.0.0" }),
    );
    gitFixture(["init", source]);
    gitFixture(["-C", source, "add", "."]);
    gitFixture([
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
  }
  await put(
    path.join(matt, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "mattpocock-skills", version: "1.0.0" }),
  );
  await put(path.join(matt, "AGENTS.md"), "CLAUDE.md");
  await put(path.join(matt, "CLAUDE.md"), "Matt instructions");
  gitFixture(["init", matt]);
  gitFixture(["-C", matt, "add", "."]);
  gitFixture([
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
  const gitBinary = spawnSync(process.platform === "win32" ? "where" : "which", ["git"], {
    encoding: "utf8",
  })
    .stdout.trim()
    .split(/\r?\n/u)[0];
  const wrapper = path.join(root, "git-wrapper.ts");
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await put(
    wrapper,
    `import {spawnSync} from 'node:child_process';
if(process.env.SETUP_TEST_NO_NETWORK) { console.error('Git retrieval forbidden'); process.exit(1); }
const replacements = ${JSON.stringify(replacements)};
const result=spawnSync(${JSON.stringify(gitBinary)},process.argv.slice(2).map(arg=>replacements[arg]??arg),{stdio:'inherit',env:process.env});
process.exit(result.status??1);`,
  );
  const built = spawnSync(
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
  if (built.status !== 0) throw new Error(built.stderr);
  await put(
    path.join(upstream, "pstack/plugin.json"),
    JSON.stringify({ name: "pstack", description: "Invalid root" }),
  );
  await put(
    path.join(upstream, "pstack/.claude-plugin/plugin.json"),
    JSON.stringify({ name: "pstack", version: "1.0.0" }),
  );
  await put(path.join(upstream, "pstack/skills/probe/SKILL.md"), "Pstack resources");
  gitFixture(["init", upstream]);
  gitFixture(["-C", upstream, "add", "."]);
  gitFixture([
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
const root = process.env.OPENCODE_CONFIG_DIR;
const file = p.join(root, 'inventory.json');
const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
if (args[0] === 'install') {
  if (process.env.SETUP_TEST_FAIL === args[1]) { console.error('fixture install failure'); process.exit(1); }
  const vendor = ${JSON.stringify(vendors)}.find(vendor => vendor.source === args[1]) || {name:args[1].includes('mattpocock-skills') ? 'mattpocock-skills' : 'pstack'};
  entries.push({ name: vendor.name, enabled: true, managed: true, receipt: { source: ['pstack','mattpocock-skills'].includes(vendor.name) ? {kind:'local',path:args[1]} : { kind: 'git', url: 'https://github.com/' + args[1] + '.git' } } });
  fs.mkdirSync(root, {recursive:true});
  fs.writeFileSync(file, JSON.stringify(entries));
  fs.appendFileSync(p.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
}
console.log(JSON.stringify({entries}));`,
  );
  await put(
    path.join(ai, "sources.json"),
    JSON.stringify({
      skills: [
        {
          name: "vercel-react-best-practices",
          root: "sources/vercel",
          path: "skills/react-best-practices",
        },
        {
          name: "checkout-relative",
          root: "sources/other",
          path: "sources/other/skills/checkout-relative",
        },
        { name: "excluded-matt", root: "sources/mattpocock-skills", path: "missing" },
        { name: "excluded-pstack", root: "plugins/pstack", path: "missing" },
      ],
    }),
  );
  await put(
    path.join(ai, "sources/vercel/skills/react-best-practices/SKILL.md"),
    "---\nname: react-best-practices\ndescription: React\n---\nRead references/rules.md",
  );
  await put(
    path.join(ai, "sources/vercel/skills/react-best-practices/references/rules.md"),
    "Full resources",
  );
  await put(path.join(ai, "sources/vercel/skills/unselected/SKILL.md"), "Unselected");
  await put(path.join(ai, "sources/other/skills/checkout-relative/SKILL.md"), "Checkout relative");
  await put(path.join(ai, "personal/skills/thea-mode/SKILL.md"), "Personal");
  const invoke = (args: string[] = [], env: Record<string, string> = {}) =>
    spawnSync(
      "bun",
      [
        installer,
        ...(npm ? [] : ["--adapter", adapter]),
        "--ai-config",
        ai,
        "--config-dir",
        config,
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          HOME: root,
          USERPROFILE: root,
          XDG_CONFIG_HOME: path.join(root, "xdg-config"),
          XDG_CACHE_HOME: path.join(root, "cache"),
          XDG_DATA_HOME: path.join(root, "data"),
          XDG_STATE_HOME: path.join(root, "state"),
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          ...env,
        },
      },
    );
  return { root, adapter, ai, config, invoke };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("npm default invokes the published manager without downloads or dry-run writes", async () => {
  const { root, config, invoke } = await fixture(true);
  const before = await readdir(root);
  const result = invoke(["--dry-run"], {
    SETUP_TEST_NO_NETWORK: "1",
    npm_config_offline: "true",
    npm_config_registry: "http://127.0.0.1:1",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Would register oc-agent-plugins@0.2.1");
  expect(result.stdout).toContain("Install cloudflare/skills");
  expect(await readdir(root)).toEqual(before);
  await expect(readFile(path.join(config, "opencode.jsonc"))).rejects.toThrow();
});

test.each(["oc-agent-plugins", "oc-agent-plugins@0.1.0", "local", "file", "relative"])(
  "npm default migrates %s registration and preserves object options and comments",
  async (kind) => {
    const { adapter, config, invoke } = await fixture(true);
    const reference =
      kind === "local"
        ? adapter
        : kind === "file"
          ? pathToFileURL(adapter).href
          : kind === "relative"
            ? `..${path.sep}adapter checkout`
            : kind;
    const file = path.join(config, "opencode.jsonc");
    await put(
      file,
      `{\n // retained\n "plugins": [{"package": ${JSON.stringify(reference)}, "options": {"components": {"mcp": false}}}]\n}\n`,
    );
    const result = invoke();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const text = await readFile(file, "utf8");
    expect(text).toContain("// retained");
    expect(parse(text).plugins).toEqual([
      { package: "oc-agent-plugins@0.2.1", options: { components: { mcp: false } } },
    ]);
    const rerun = invoke();
    expect(rerun.status).toBe(0);
    expect(rerun.stdout).toContain("Skip cloudflare");
    expect(await readFile(file, "utf8")).toBe(text);
  },
);

test("npm default rejects duplicate npm/local registrations before writing", async () => {
  const { adapter, config, invoke } = await fixture(true);
  const file = path.join(config, "opencode.jsonc");
  const original = JSON.stringify({ plugins: ["oc-agent-plugins", adapter] });
  await put(file, original);
  const result = invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("registered more than once");
  expect(await readFile(file, "utf8")).toBe(original);
});

test.each(["absolute", "file", "relative"])(
  "npm default migrates the missing former sibling via %s without adopting arbitrary missing paths",
  async (kind) => {
    const { root, config, invoke } = await fixture(true, true);
    const old = path.join(root, "opencode-agent-plugins");
    const reference =
      kind === "file"
        ? pathToFileURL(old).href
        : kind === "relative"
          ? `..${path.sep}opencode-agent-plugins`
          : old;
    const unrelated = path.join(root, "missing-other-plugin");
    const file = path.join(config, "opencode.jsonc");
    await put(
      file,
      JSON.stringify({
        plugins: [unrelated, { package: reference, options: { components: { mcp: false } } }],
      }),
    );
    const result = invoke();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(parse(await readFile(file, "utf8")).plugins).toEqual([
      unrelated,
      { package: "oc-agent-plugins@0.2.1", options: { components: { mcp: false } } },
    ]);
    await expect(readFile(path.join(old, "package.json"))).rejects.toThrow();
  },
);

test("npm default adds the pinned string registration without adopting unrelated local plugins", async () => {
  const { root, config, invoke } = await fixture(true);
  const unrelated = path.join(root, "unrelated");
  await put(path.join(unrelated, "package.json"), JSON.stringify({ name: "other-plugin" }));
  const file = path.join(config, "opencode.jsonc");
  await put(file, JSON.stringify({ plugins: [unrelated] }));
  const first = invoke();
  expect(first.stderr).toBe("");
  expect(first.status).toBe(0);
  expect(parse(await readFile(file, "utf8")).plugins).toEqual([
    unrelated,
    "oc-agent-plugins@0.2.1",
  ]);
  await put(file, JSON.stringify({ plugins: ["oc-agent-plugins@0.1.0"] }));
  expect(invoke().status).toBe(0);
  expect(parse(await readFile(file, "utf8")).plugins).toEqual(["oc-agent-plugins@0.2.1"]);
});

test("installs exact vendors, keeps comments/options and aliases with full resources, reruns without writes", async () => {
  const { adapter, config, ai, invoke } = await fixture();
  const file = path.join(config, "opencode.jsonc");
  await put(
    file,
    `{\n // keep this comment\n "model": "test/model",\n "plugins": [{"package":${JSON.stringify(adapter)}, "options":{"components":{"mcp":false},"formats":{"codex":false}}}],\n "skills": ["existing"],\n "permissions": [{"effect":"deny","action":"shell","resource":"*"}],\n}\n`,
  );
  const first = invoke();
  expect(first.stderr).toBe("");
  expect(first.status).toBe(0);
  const text = await readFile(file, "utf8");
  expect(text).toContain("// keep this comment");
  const value = parse(text);
  expect(value.plugins).toEqual([
    {
      package: adapter,
      options: { components: { mcp: false }, formats: { codex: false } },
    },
  ]);
  expect(value.skills).toEqual(["existing", path.join(config, "setup-native-skills")]);
  const view = path.join(config, "setup-native-skills");
  expect((await readdir(view)).sort()).toEqual([
    "checkout-relative",
    "thea-mode",
    "vercel-react-best-practices",
  ]);
  expect(await realpath(path.join(view, "vercel-react-best-practices"))).toBe(
    await realpath(path.join(ai, "sources/vercel/skills/react-best-practices")),
  );
  expect(
    await readFile(path.join(view, "vercel-react-best-practices/references/rules.md"), "utf8"),
  ).toBe("Full resources");
  const calls = (await readFile(path.join(config, "calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(calls).toEqual(
    vendors.map((vendor) => [
      "install",
      vendor.name === "pstack"
        ? path.join(config, "setup-sources/pstack/checkout/pstack")
        : vendor.name === "mattpocock-skills"
          ? path.join(config, "setup-sources/mattpocock-skills/checkout")
          : vendor.source,
      "--global",
      "--json",
    ]),
  );
  expect(invoke().status).toBe(0);
  expect(await readFile(file, "utf8")).toBe(text);
  expect(
    (await readFile(path.join(config, "calls.jsonl"), "utf8")).trim().split("\n"),
  ).toHaveLength(4);
});

test("dry-run does not create target or retrieve vendors", async () => {
  const { config, invoke } = await fixture();
  const result = invoke(["--dry-run"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("No writes performed");
  await expect(readdir(config)).rejects.toThrow();
});

test("stage digest rejects path-content boundary collisions", async () => {
  const { config, invoke } = await fixture();
  expect(invoke().status).toBe(0);
  const source = path.join(config, "setup-sources/pstack/checkout/pstack");
  const first = path.join(source, ".claude-plugin/plugin.json");
  const second = path.join(source, "skills/probe/SKILL.md");
  const original = await readFile(first, "utf8");
  await writeFile(
    first,
    original + "skillsskills/probeskills/probe/SKILL.md" + (await readFile(second, "utf8")),
  );
  await rm(path.join(source, "skills"), { recursive: true });
  const result = invoke(["--dry-run"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("edited or unowned pstack stage");
});

test.skipIf(process.platform === "win32")(
  "stage digest distinguishes literal backslashes from directories",
  async () => {
    const { config, invoke } = await fixture();
    expect(invoke().status).toBe(0);
    const source = path.join(config, "setup-sources/pstack/checkout/pstack");
    await mkdir(path.join(source, "a"));
    await writeFile(path.join(source, "a\\b"), "X");
    const { fingerprint } = await import("../src/staging.ts");
    const original = await fingerprint(source);
    await rm(path.join(source, "a\\b"));
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
  expect(invoke().status).toBe(0);
  const text = await readFile(file, "utf8");
  expect(text).toContain("// plugin comment");
  expect(text).toContain("// skill comment");
});

test("rejects edited or missing compatibility stage receipt without reinstalling snapshots", async () => {
  const { config, invoke } = await fixture();
  expect(invoke().status).toBe(0);
  const calls = await readFile(path.join(config, "calls.jsonl"), "utf8");
  await put(
    path.join(config, "setup-sources/pstack/checkout/pstack/skills/probe/SKILL.md"),
    "Edited stage",
  );
  const failed = invoke();
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("edited or unowned");
  expect(await readFile(path.join(config, "calls.jsonl"), "utf8")).toBe(calls);
});

test("preflights unowned stages even on dry-run before any vendor installations", async () => {
  const { config, invoke } = await fixture();
  await put(path.join(config, "setup-sources/mattpocock-skills/checkout/CLAUDE.md"), "Unowned");
  expect(invoke(["--dry-run"]).status).toBe(1);
  expect(invoke().status).toBe(1);
  await expect(readFile(path.join(config, "calls.jsonl"))).rejects.toThrow();
});

test("rejects escaping skill inputs and duplicate aliases before manager mutations", async () => {
  const { ai, config, invoke } = await fixture();
  await put(
    path.join(ai, "sources.json"),
    JSON.stringify({ skills: [{ name: "escape", root: "../outside", path: "skill" }] }),
  );
  expect(invoke().stderr).toContain("Unsafe source path");
  await expect(readdir(config)).rejects.toThrow();
  await put(
    path.join(ai, "sources.json"),
    JSON.stringify({ skills: [{ name: "thea-mode", root: "personal", path: "skills/thea-mode" }] }),
  );
  expect(invoke().stderr).toContain("Duplicate native skill alias");
  await expect(readdir(config)).rejects.toThrow();
});

test.each(["opencode.json", "opencode.jsonc"])(
  "validates both config files before mutations: %s",
  async (name) => {
    const { config, invoke } = await fixture();
    await put(path.join(config, name), "{ broken");
    await put(
      path.join(config, name === "opencode.json" ? "opencode.jsonc" : "opencode.json"),
      "{}",
    );
    const result = invoke();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Malformed JSON/JSONC");
    expect((await readdir(config)).sort()).toEqual(["opencode.json", "opencode.jsonc"]);
  },
);

test.each(["edited", "unmanaged", "source", "disabled"])("receipt safety: %s", async (kind) => {
  const { config, invoke } = await fixture();
  const entry = {
    name: "1password",
    managed: kind !== "unmanaged",
    enabled: false,
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
  const result = invoke(["--dry-run"]);
  expect(result.status).toBe(kind === "disabled" ? 0 : 1);
  if (kind === "disabled") expect(result.stdout).toContain("disabled");
  expect(await readFile(file, "utf8")).toBe(JSON.stringify([entry]));
});

test("fails honestly after partial vendor installation and rerun resumes", async () => {
  const { config, invoke } = await fixture();
  const failed = invoke([], { SETUP_TEST_FAIL: "cloudflare/skills" });
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("Partial setup");
  await expect(readFile(path.join(config, "opencode.jsonc"))).rejects.toThrow();
  expect(invoke().status).toBe(0);
  expect(
    (await readFile(path.join(config, "calls.jsonl"), "utf8")).trim().split("\n"),
  ).toHaveLength(4);
});

test("preserves explicit format options and rejects conflicting native view without mutations", async () => {
  const { adapter, config, invoke } = await fixture();
  await put(
    path.join(config, "opencode.json"),
    JSON.stringify({
      plugins: [{ package: adapter, options: { formats: { "agent-plugins": true } } }],
    }),
  );
  expect(invoke(["--dry-run"]).status).toBe(0);
  await put(path.join(config, "opencode.json"), "{}");
  await put(
    path.join(config, "setup-native-skills/vercel-react-best-practices/SKILL.md"),
    "Unmanaged",
  );
  expect(invoke().stderr).toContain("Conflicting native skill view entry");
  await expect(readFile(path.join(config, "inventory.json"))).rejects.toThrow();
});

test("help succeeds without checkouts and invalid arguments fail", () => {
  const help = spawnSync("bun", [path.resolve("src/cli.ts"), "--help"], { encoding: "utf8" });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("--dry-run");
  const bad = spawnSync("bun", [path.resolve("src/cli.ts"), "--unknown"], { encoding: "utf8" });
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
  const cli = process.env.ADAPTER_TEST_DIR
    ? path.resolve(process.env.ADAPTER_TEST_DIR, "dist/cli.js")
    : path.join(
        path.dirname(createRequire(import.meta.url).resolve("oc-agent-plugins/package.json")),
        "dist/cli.js",
      );
  const call = (args: string[]) =>
    spawnSync("node", [cli, ...args, "--global", "--json"], {
      env: { ...process.env, OPENCODE_CONFIG_DIR: config },
      cwd: root,
      encoding: "utf8",
    });
  expect(call(["install", source]).status).toBe(0);
  const inventory = JSON.parse(call(["list"]).stdout);
  expect(inventory.entries[0].name).toBe("fixture");
  expect(inventory.entries[0].managed).toBe(true);
  expect(inventory.entries[0].problem).toBeUndefined();
  await put(path.join(config, "agent-plugins/fixture/skills/probe/SKILL.md"), "Edited");
  expect(call(["update", "fixture"]).status).toBe(1);
  expect(
    await readFile(path.join(config, "agent-plugins/fixture/skills/probe/SKILL.md"), "utf8"),
  ).toBe("Edited");
  const pstack = path.join(root, "pstack");
  await put(
    path.join(pstack, "plugin.json"),
    JSON.stringify({ name: "pstack", description: "Invalid root takes priority" }),
  );
  await put(
    path.join(pstack, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "pstack", version: "1.0.0" }),
  );
  const failed = call(["install", pstack]);
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("$schema is missing or not a string");
  await expect(readFile(path.join(config, "agent-plugins/pstack/plugin.json"))).rejects.toThrow();
});

test.skipIf(!process.env.OPENCODE_TEST_BINARY)(
  "native V2 discovers only selected aliases through the skill view",
  async () => {
    const { root, config, invoke } = await fixture();
    expect(invoke().status).toBe(0);
    await put(
      path.join(config, "opencode.jsonc"),
      JSON.stringify({ skills: [path.join(config, "setup-native-skills")] }),
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      OPENCODE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: path.join(root, "xdg-config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_STATE_HOME: path.join(root, "state"),
    };
    delete env.OPENCODE_CONFIG;
    delete env.OPENCODE_CONFIG_CONTENT;
    delete env.OPENCODE_HOST;
    const binary = process.env.OPENCODE_TEST_BINARY ?? "opencode";
    const child = spawn(binary, ["serve", "--stdio", "--port", "0"], {
      env,
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let stdout = "";
        const timeout = setTimeout(
          () => reject(new Error("Isolated OpenCode did not announce its URL")),
          15000,
        );
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
          for (const line of stdout.split("\n")) {
            try {
              const value: unknown = JSON.parse(line);
              if (
                typeof value === "object" &&
                value !== null &&
                "url" in value &&
                typeof value.url === "string"
              ) {
                clearTimeout(timeout);
                resolve(value.url);
              }
            } catch {
              /* Startup may include non-JSON diagnostic lines. */
            }
          }
        });
      });
      let ids: string[] = [];
      let lastResponse = "";
      for (let attempt = 0; attempt < 30; attempt++) {
        spawnSync(binary, ["api", "--server", url, "GET", "/api/plugin"], {
          env,
          cwd: root,
          encoding: "utf8",
          timeout: 10000,
        });
        const result = spawnSync(binary, ["api", "--server", url, "GET", "/api/skill"], {
          env,
          cwd: root,
          encoding: "utf8",
          timeout: 10000,
        });
        lastResponse = `${result.status} ${result.stdout} ${result.stderr}`;
        if (result.status === 0) {
          const response: unknown = JSON.parse(result.stdout);
          const values =
            typeof response === "object" && response !== null && "data" in response
              ? response.data
              : response;
          if (Array.isArray(values))
            ids = values.flatMap((value: unknown) =>
              typeof value === "object" &&
              value !== null &&
              "id" in value &&
              typeof value.id === "string"
                ? [value.id]
                : [],
            );
        }
        if (ids.includes("vercel-react-best-practices")) break;
        await delay(100);
      }
      expect(ids.filter((id) => id !== "opencode" && id !== "report").sort(), lastResponse).toEqual(
        ["checkout-relative", "thea-mode", "vercel-react-best-practices"],
      );
    } finally {
      child.kill();
      await exited;
    }
  },
  45000,
);
