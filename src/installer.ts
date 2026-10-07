import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { VENDORS } from "./vendors.ts";
import { stat } from "./filesystem.ts";
import { stagedSource, stageVendor, validateStage } from "./staging.ts";

const HELP = `Install OpenCode V2 vendor plugins and native ai-config skills.

Usage: bun run setup [--dry-run] [--adapter PATH] [--ai-config PATH] [--config-dir PATH]

Defaults: installed oc-agent-plugins@0.2.1 and sibling ai-config checkout.
--adapter PATH selects an optional built local adapter instead of npm.
Config: OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME/opencode, ~/.config/opencode.
--dry-run validates and reports without writes or network retrieval.
Existing healthy owned vendor snapshots are skipped, including disabled packages.
Use the adapter's update command explicitly to refresh snapshots.
--help, -h show this help.`;

type ObjectValue = Record<string, unknown>;
const ADAPTER_VERSION = "0.2.1";
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
    typeof pkg.bin === "string"
      ? pkg.bin
      : object(pkg.bin ?? {}, "adapter bin")["oc-agent-plugins"];
  const cli = path.resolve(directory, typeof bin === "string" ? bin : "dist/cli.js");
  if (
    pkg.name !== "oc-agent-plugins" ||
    (!override && (pkg.version !== ADAPTER_VERSION || typeof bin !== "string")) ||
    !contained(directory, cli) ||
    !(await stat(cli))?.isFile() ||
    !contained(directory, await realpath(cli)) ||
    !(await stat(path.join(directory, "index.ts")))?.isFile()
  )
    throw new Error(
      override
        ? `Expected built oc-agent-plugins checkout at ${directory}. Run bun install and bun run build there.`
        : `Expected installed ${ADAPTER_SPEC} with its CLI. Run bun install --frozen-lockfile.`,
    );
  return { directory, cli, reference: override ? directory : ADAPTER_SPEC };
}

async function isLocalAdapter(candidate: string): Promise<boolean> {
  const file = path.join(candidate, "package.json");
  if (!(await stat(file))?.isFile()) return false;
  try {
    return object(JSON.parse(await readFile(file, "utf8")), file).name === "oc-agent-plugins";
  } catch {
    return false;
  }
}
interface Skill {
  readonly name: string;
  readonly directory: string;
}
interface Document {
  readonly file: string;
  readonly original: string;
  readonly value: ObjectValue;
}

function object(value: unknown, label: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as ObjectValue;
}

function decode(text: string, label: string): ObjectValue {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0)
    throw new Error(`Malformed JSON/JSONC in ${label} (offset ${errors[0]?.offset})`);
  return object(value, label);
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function segment(name: unknown): string {
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) || name.length > 64)
    throw new Error(`Invalid skill alias: ${String(name)}`);
  return name;
}

async function skillsFrom(checkout: string): Promise<Skill[]> {
  const root = await realpath(checkout);
  const data = object(
    JSON.parse(await readFile(path.join(root, "sources.json"), "utf8")),
    "sources.json",
  );
  if (!Array.isArray(data.skills)) throw new Error("sources.json skills must be an array");
  const skills = new Map<string, Skill>();
  async function add(name: string, directory: string) {
    const canonical = await realpath(directory);
    if (!contained(root, canonical))
      throw new Error(`Skill escapes ai-config checkout: ${directory}`);
    if (
      !(await stat(canonical))?.isDirectory() ||
      !(await stat(path.join(canonical, "SKILL.md")))?.isFile()
    )
      throw new Error(`Missing skill directory or SKILL.md: ${directory}`);
    if (skills.has(name)) throw new Error(`Duplicate native skill alias: ${name}`);
    skills.set(name, { name, directory: canonical });
  }
  for (const entry of data.skills) {
    const source = object(entry, "sources.json skill");
    const name = segment(source.name);
    if (typeof source.root !== "string" || typeof source.path !== "string")
      throw new Error(`Missing root/path for ${name}`);
    const sourceRoot = path.resolve(root, source.root);
    const origin = path.relative(root, sourceRoot).replaceAll("\\", "/");
    if (
      VENDORS.some((vendor) =>
        vendor.excludedRoots.some(
          (excluded) => origin === excluded || origin.startsWith(`${excluded}/`),
        ),
      )
    )
      continue;
    if (!contained(root, sourceRoot) || path.isAbsolute(source.path))
      throw new Error(`Unsafe source path for ${name}`);
    const candidates = [path.resolve(sourceRoot, source.path), path.resolve(root, source.path)];
    let directory: string | undefined;
    for (const candidate of candidates) {
      if (
        contained(sourceRoot, candidate) &&
        (await stat(path.join(candidate, "SKILL.md")))?.isFile()
      ) {
        directory = candidate;
        break;
      }
    }
    if (directory === undefined)
      throw new Error(`Cannot resolve ${name} from root ${source.root} and path ${source.path}`);
    if (!contained(await realpath(sourceRoot), await realpath(directory)))
      throw new Error(`Skill escapes declared source root: ${name}`);
    await add(name, directory);
  }
  const personal = path.join(root, "personal", "skills");
  if ((await stat(personal))?.isDirectory()) {
    for (const entry of await readdir(personal, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink())
        await add(segment(entry.name), path.join(personal, entry.name));
    }
  }
  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function documents(config: string): Promise<Document[]> {
  const docs: Document[] = [];
  for (const name of ["opencode.json", "opencode.jsonc"]) {
    const file = path.join(config, name);
    const info = await stat(file);
    if (info === undefined) continue;
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`Config must be a regular file: ${file}`);
    const original = await readFile(file, "utf8");
    const value = decode(original, file);
    if (
      value.skills !== undefined &&
      (!Array.isArray(value.skills) ||
        !value.skills.every((item: unknown) => typeof item === "string"))
    )
      throw new Error(`skills must be a string array in ${file}`);
    if (value.plugins !== undefined) {
      if (!Array.isArray(value.plugins)) throw new Error(`plugins must be an array in ${file}`);
      for (const item of value.plugins) {
        if (
          typeof item !== "string" &&
          typeof object(item, `plugin in ${file}`).package !== "string"
        )
          throw new Error(`Invalid plugin entry in ${file}`);
      }
    }
    docs.push({ file, original, value });
  }
  return docs;
}

function manager(cli: string, config: string, args: string[]): ObjectValue {
  const result = spawnSync("node", [cli, ...args, "--global", "--json"], {
    env: { ...process.env, OPENCODE_CONFIG_DIR: config },
    encoding: "utf8",
  });
  if (result.error)
    throw new Error(`Cannot run adapter manager. Install Node >=22.14: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(
      `Adapter manager ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  return object(JSON.parse(result.stdout), "adapter manager response");
}

async function validateView(view: string, skills: Skill[]) {
  const info = await stat(view);
  if (info === undefined) return;
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`Native skill view must be a regular directory: ${view}`);
  const expected = new Map(skills.map((skill) => [skill.name, skill.directory]));
  for (const name of await readdir(view)) {
    const link = path.join(view, name);
    if (
      !(await stat(link))?.isSymbolicLink() ||
      !expected.has(name) ||
      (await realpath(link)) !== expected.get(name)
    )
      throw new Error(
        `Conflicting native skill view entry: ${link}. Move the old view aside and rerun; it will not be overwritten.`,
      );
  }
}

export async function run(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const options = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg || !["--adapter", "--ai-config", "--config-dir"].includes(arg))
      throw new Error(`Unknown argument ${arg}. Use --help.`);
    const value = argv[++index];
    if (!value || value.startsWith("--") || options.has(arg))
      throw new Error(`Expected one path after ${arg}`);
    options.set(arg, value);
  }
  const parent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const override = options.get("--adapter");
  const adapter = await adapterSource(override);
  const aiConfig = path.resolve(options.get("--ai-config") ?? path.join(parent, "ai-config"));
  const config = path.resolve(
    options.get("--config-dir") ??
      (process.env.OPENCODE_CONFIG_DIR ||
        path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode")),
  );
  const { cli } = adapter;
  const configInfo = await stat(config);
  if (configInfo && (!configInfo.isDirectory() || configInfo.isSymbolicLink()))
    throw new Error(`Config target must be a regular directory: ${config}`);
  const docs = await documents(config);
  const skills = await skillsFrom(aiConfig);
  const view = path.join(config, "setup-native-skills");
  await validateView(view, skills);
  const registrations: { doc: Document; entry: unknown; reference: string; index: number }[] = [];
  for (const doc of docs)
    for (const [index, entry] of ((doc.value.plugins ?? []) as unknown[]).entries()) {
      const reference = typeof entry === "string" ? entry : object(entry, "plugin").package;
      if (typeof reference !== "string") continue;
      const candidate = reference.startsWith("file:")
        ? fileURLToPath(reference)
        : reference.startsWith("~" + path.sep) || reference.startsWith("~/")
          ? path.join(homedir(), reference.slice(2))
          : path.isAbsolute(reference)
            ? reference
            : reference.startsWith(".")
              ? path.resolve(config, reference)
              : undefined;
      if (
        isNpmAdapter(reference) ||
        (candidate &&
          (override
            ? (await stat(candidate)) && (await realpath(candidate)) === adapter.directory
            : path.resolve(candidate) === path.join(parent, "opencode-agent-plugins") ||
              (await isLocalAdapter(candidate))))
      )
        registrations.push({ doc, entry, reference, index });
    }
  if (registrations.length > 1)
    throw new Error("Adapter is registered more than once; remove duplicate entries before setup.");
  const registration = registrations[0];
  const target = registration?.doc ??
    docs.find((doc) => doc.file.endsWith(".jsonc")) ??
    docs[0] ?? { file: path.join(config, "opencode.jsonc"), original: "{}\n", value: {} };
  let updated = target.original;
  const formattingOptions = {
    insertSpaces: true,
    tabSize: 2,
    eol: target.original.includes("\r\n") ? "\r\n" : "\n",
  };
  const adapterEntry = adapter.reference;
  if (!registration)
    updated = applyEdits(
      updated,
      modify(
        updated,
        target.value.plugins === undefined ? ["plugins"] : ["plugins", -1],
        target.value.plugins === undefined ? [adapterEntry] : adapterEntry,
        { formattingOptions },
      ),
    );
  else if (!override || isNpmAdapter(registration.reference))
    updated = applyEdits(
      updated,
      modify(
        updated,
        typeof registration.entry === "string"
          ? ["plugins", registration.index]
          : ["plugins", registration.index, "package"],
        adapterEntry,
        { formattingOptions },
      ),
    );
  if (!docs.some((doc) => ((doc.value.skills ?? []) as string[]).includes(view)))
    updated = applyEdits(
      updated,
      modify(
        updated,
        target.value.skills === undefined ? ["skills"] : ["skills", -1],
        target.value.skills === undefined ? [view] : view,
        { formattingOptions },
      ),
    );
  const inventory = manager(cli, config, ["list"]).entries;
  if (!Array.isArray(inventory)) throw new Error("Adapter list response must include entries");
  const pending: (typeof VENDORS)[number][] = [];
  for (const vendor of VENDORS) {
    const matches = inventory
      .map((entry) => object(entry, "installation"))
      .filter((entry) => entry.name === vendor.name);
    if (matches.length === 0) {
      pending.push(vendor);
      continue;
    }
    const entry = matches[0];
    if (!entry || matches.length !== 1 || entry.managed !== true || entry.problem !== undefined)
      throw new Error(
        `Cannot use ${vendor.name}: conflicting, edited or unmanaged installation. Inspect adapter doctor/info.`,
      );
    const receipt = object(entry.receipt, `${vendor.name} receipt`);
    const source = object(receipt.source, `${vendor.name} source`);
    const matchesSource = vendor.staged
      ? source.kind === "local" && source.path === stagedSource(config, vendor.name)
      : source.kind === "git" &&
        source.url === `https://github.com/${vendor.source}.git` &&
        source.ref === undefined &&
        source.subdir === undefined;
    if (!matchesSource)
      throw new Error(
        `Source conflict for ${vendor.name}; expected ${vendor.source}. Existing snapshot left untouched.`,
      );
    if (vendor.staged) await validateStage(config, vendor.name);
    console.log(
      `Skip ${vendor.name} (healthy managed snapshot, ${entry.enabled ? "enabled" : "disabled"})`,
    );
  }
  console.log(`${dryRun ? "Dry run" : "Target"}: ${config}`);
  for (const vendor of pending)
    if (vendor.staged) {
      const cache = path.join(config, "setup-sources", vendor.name);
      if (await stat(cache)) await validateStage(config, vendor.name);
    }
  const stageParent = await stat(path.join(config, "setup-sources"));
  if (stageParent && (!stageParent.isDirectory() || stageParent.isSymbolicLink()))
    throw new Error("setup-sources must be a regular owned directory");
  for (const skill of skills) console.log(`Native ${skill.name} -> ${skill.directory}`);
  for (const vendor of pending)
    console.log(
      `Install ${vendor.source}${"subdir" in vendor ? ` --subdir ${vendor.subdir}` : ""}`,
    );
  if (dryRun) {
    for (const vendor of pending)
      if (vendor.staged)
        console.log(
          `Would create owned compatibility stage at ${stagedSource(config, vendor.name)}. No staging performed.`,
        );
    console.log(
      `Would register ${adapterEntry} and ${view} in ${target.file}. No writes performed.`,
    );
    return;
  }
  try {
    for (const vendor of pending) {
      const source = vendor.staged ? await stageVendor(config, vendor.name) : vendor.source;
      manager(cli, config, ["install", source]);
      console.log(`Installed ${vendor.name}`);
    }
    await mkdir(view, { recursive: true });
    for (const skill of skills) {
      const link = path.join(view, skill.name);
      if (!(await stat(link)))
        await symlink(skill.directory, link, process.platform === "win32" ? "junction" : "dir");
    }
    if (updated !== target.original) {
      const current = (await stat(target.file)) ? await readFile(target.file, "utf8") : "{}\n";
      if (current !== target.original)
        throw new Error(`Configuration changed during setup: ${target.file}`);
      const temporary = `${target.file}.setup-${process.pid}-${crypto.randomUUID()}`;
      await writeFile(temporary, updated, {
        flag: "wx",
        mode: (await stat(target.file))?.mode ?? 0o600,
      });
      try {
        await rename(temporary, target.file);
      } finally {
        if (await stat(temporary)) await unlink(temporary);
      }
    }
  } catch (error) {
    throw new Error(
      `Partial setup; earlier installed snapshots or native links are retained. Rerun after resolving the error. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.log(`Configured ${target.file}. No trust granted or OpenCode/MCP processes started.`);
}
