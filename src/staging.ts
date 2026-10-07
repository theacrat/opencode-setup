// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { createHash } from "node:crypto";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import {
  lstat,
  mkdir,
  readFile,
  writeFile,
  unlink,
  readlink,
  readdir,
  mkdtemp,
  rename,
  realpath,
  rm,
} from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { stat } from "./filesystem.ts";
import { execute } from "./platform.ts";
import type { Environment } from "./platform.ts";
import { validateLayout } from "./refresh.ts";
import { sequence } from "./sequence.ts";
import { object } from "./values.ts";
import { VENDORS } from "./vendors.ts";

async function fingerprint(directory: string, includeGit = false): Promise<string> {
  const hash = createHash("sha256");
  function frame(value: string | Buffer) {
    const bytes = typeof value === "string" ? Buffer.from(value) : value;
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  }
  async function visit(current: string) {
    const directoryEntries = await readdir(current, { withFileTypes: true });
    await sequence(
      directoryEntries.toSorted((first, second) => first.name.localeCompare(second.name)),
      async (entry) => {
        if (entry.name === ".git" && !includeGit) {
          return;
        }
        const file = path.join(current, entry.name);
        if (entry.isSymbolicLink()) {
          throw new Error(`Unsafe vendor stage symlink: ${file}`);
        }
        const info = await lstat(file);
        frame(path.relative(directory, file).split(path.sep).join("/"));
        frame(String(info.mode % 0o1000));
        if (entry.isDirectory()) {
          frame("directory");
          await visit(file);
        } else if (entry.isFile()) {
          frame("file");
          frame(await readFile(file));
        } else {
          throw new Error(`Unsafe vendor staging entry: ${file}`);
        }
      },
    );
  }
  await visit(directory);
  return hash.digest("hex");
}

type StagedVendor = "pstack" | "mattpocock-skills";
function stagedVendor(name: StagedVendor) {
  const vendor = VENDORS.find((candidate) => candidate.name === name);
  if (!vendor) {
    throw new Error(`Unknown staged vendor ${name}`);
  }
  return { repository: vendor.source, subdir: "subdir" in vendor ? vendor.subdir : "" };
}

function stagedSource(config: string, name: StagedVendor): string {
  return path.join(config, "setup-sources", name, "checkout", stagedVendor(name).subdir);
}

async function validateStage(config: string, name: StagedVendor): Promise<void> {
  await validateLayout(path.join(config, "setup-sources", name), [
    "checkout",
    "gitconfig",
    "empty-hooks",
    "compatibility.json",
  ]);
  const source = stagedSource(config, name);
  const vendor = stagedVendor(name);
  await sequence(
    [
      path.join(config, "setup-sources"),
      path.join(config, "setup-sources", name),
      path.join(config, "setup-sources", name, "checkout"),
      source,
    ],
    async (directory) => {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Unsafe staged directory: ${directory}`);
      }
    },
  );
  const markerFile = path.join(config, "setup-sources", name, "compatibility.json");
  const markerInfo = await lstat(markerFile);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) {
    throw new Error(`Unsafe staging receipt: ${markerFile}`);
  }
  const markerText = await readFile(markerFile, "utf8");
  const marker = object(JSON.parse(markerText), "staging receipt");
  if (
    marker["source"] !== `https://github.com/${vendor.repository}.git` ||
    marker["subdir"] !== vendor.subdir ||
    marker["digestVersion"] !== 2 ||
    typeof marker["revision"] !== "string" ||
    marker["fingerprint"] !== (await fingerprint(source))
  ) {
    throw new Error(
      `Missing, edited or unowned ${name} stage at ${source}. Preserve it and move it aside deliberately before a fresh install.`,
    );
  }
}

async function git(args: string[], globalConfig: string, env: Environment): Promise<string> {
  try {
    const result = await execute("git", args, {
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: path.dirname(globalConfig),
      PATH: env.PATH,
      SystemRoot: env.SystemRoot,
      TEMP: env.TEMP,
      TMP: env.TMP,
      USERPROFILE: path.dirname(globalConfig),
    });
    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      `Vendor staging requires Git: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function regular(file: string, root: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Expected regular staging file: ${file}`);
  }
  const relative = path.relative(await realpath(root), await realpath(file));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Staging file escapes root: ${file}`);
  }
  return readFile(file, "utf8");
}

async function adjustSource(source: string, name: StagedVendor) {
  let adjustment: Record<string, unknown>;
  if (name === "pstack") {
    const rootManifest = path.join(source, "plugin.json");
    const original = await regular(rootManifest, source);
    const manifest: unknown = JSON.parse(original);
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("name" in manifest) ||
      manifest.name !== "pstack" ||
      !("description" in manifest) ||
      typeof manifest.description !== "string" ||
      Object.keys(manifest).some((key) => key !== "name" && key !== "description") ||
      "$schema" in manifest
    ) {
      throw new Error(
        "pstack root manifest changed; compatibility staging must be reviewed before installation. Staging retained.",
      );
    }
    const claude: unknown = JSON.parse(
      await regular(path.join(source, ".claude-plugin", "plugin.json"), source),
    );
    if (
      typeof claude !== "object" ||
      claude === null ||
      !("name" in claude) ||
      claude.name !== "pstack"
    ) {
      throw new Error("pstack staging requires its valid Claude manifest.");
    }
    await unlink(rootManifest);
    adjustment = { omittedManifest: original };
  } else {
    const file = path.join(source, "AGENTS.md");
    const info = await lstat(file);
    const target = info.isSymbolicLink() ? await readlink(file) : await regular(file, source);
    if (target.trim() !== "CLAUDE.md") {
      throw new Error(
        "Matt Pocock AGENTS.md link changed; compatibility staging must be reviewed.",
      );
    }
    const content = await regular(path.join(source, "CLAUDE.md"), source);
    await unlink(file);
    await writeFile(file, content, { flag: "wx" });
    adjustment = { materialisedLink: { path: "AGENTS.md", target: "CLAUDE.md" } };
  }
  return adjustment;
}

async function gitWorkspace(parent: string, prefix: string) {
  await mkdir(parent, { recursive: true });
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error(`Unsafe staging parent: ${parent}`);
  }
  const scratch = await mkdtemp(path.join(parent, prefix));
  const globalConfig = path.join(scratch, "gitconfig");
  await writeFile(globalConfig, "", { flag: "wx" });
  const hooks = path.join(scratch, "empty-hooks");
  await mkdir(hooks);
  return { globalConfig, hooks, scratch };
}
async function cloneSource(
  cache: string,
  vendor: { repository: string; subdir: string },
  name: StagedVendor,
  env: Environment,
) {
  const { scratch, globalConfig, hooks } = await gitWorkspace(
    path.dirname(cache),
    `.${name}-staging-`,
  );
  const checkout = path.join(scratch, "checkout");
  const source = path.join(checkout, vendor.subdir);
  try {
    await git(
      [
        "-c",
        `core.hooksPath=${hooks}`,
        "clone",
        "--template=",
        "--depth",
        "1",
        "--",
        `https://github.com/${vendor.repository}.git`,
        checkout,
      ],
      globalConfig,
      env,
    );
    const revision = await git(["-C", checkout, "rev-parse", "HEAD"], globalConfig, env);
    return { revision, scratch, source };
  } catch (error) {
    await rm(scratch, { recursive: true });
    throw error;
  }
}
async function acquireStage(config: string, name: StagedVendor, env: Environment) {
  const cache = path.join(config, "setup-sources", name);
  const vendor = stagedVendor(name);
  const { scratch, source, revision } = await cloneSource(cache, vendor, name, env);
  try {
    const sourceInfo = await lstat(source);
    if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
      throw new Error(`Unsafe staged source directory: ${source}`);
    }
    const adjustment = await adjustSource(source, name);
    await writeFile(
      path.join(scratch, "compatibility.json"),
      JSON.stringify(
        {
          digestVersion: 2,
          revision,
          source: `https://github.com/${vendor.repository}.git`,
          subdir: vendor.subdir,
          ...adjustment,
          fingerprint: await fingerprint(source),
        },
        undefined,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    return { cache, scratch };
  } catch (error) {
    await rm(scratch, { recursive: true });
    throw error;
  }
}
async function stageVendor(config: string, name: StagedVendor, env: Environment): Promise<string> {
  const cache = path.join(config, "setup-sources", name);
  if (await stat(cache)) {
    await validateStage(config, name);
    return stagedSource(config, name);
  }
  const { scratch } = await acquireStage(config, name, env);
  if (await stat(cache)) {
    throw new Error(`Staging target appeared concurrently: ${cache}`);
  }
  await rename(scratch, cache);
  console.log(
    `${name} compatibility staging at ${stagedSource(config, name)}; ${name === "pstack" ? "only invalid root plugin.json omitted" : "AGENTS.md -> CLAUDE.md materialised"}`,
  );
  return stagedSource(config, name);
}

export { acquireStage, fingerprint, git, gitWorkspace, stagedSource, validateStage, stageVendor };
