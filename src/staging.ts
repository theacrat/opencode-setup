import { spawnSync } from "node:child_process";
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
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { VENDORS } from "./vendors.ts";
import { stat } from "./filesystem.ts";

async function fingerprint(directory: string): Promise<string> {
  const hash = createHash("sha256");
  function frame(value: string | Buffer) {
    const bytes = typeof value === "string" ? Buffer.from(value) : value;
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  }
  async function visit(current: string) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === ".git") continue;
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unsafe vendor stage symlink: ${file}`);
      const info = await lstat(file);
      frame(path.relative(directory, file).replaceAll("\\", "/"));
      frame(String(info.mode & 0o777));
      if (entry.isDirectory()) {
        frame("directory");
        await visit(file);
      } else if (entry.isFile()) {
        frame("file");
        frame(await readFile(file));
      } else throw new Error(`Unsafe vendor staging entry: ${file}`);
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

type StagedVendor = "pstack" | "mattpocock-skills";
function stagedVendor(name: StagedVendor) {
  const vendor = VENDORS.find((vendor) => vendor.name === name);
  if (!vendor) throw new Error(`Unknown staged vendor ${name}`);
  return { repository: vendor.source, subdir: "subdir" in vendor ? vendor.subdir : "" };
}

export async function validateStage(config: string, name: StagedVendor): Promise<void> {
  const source = stagedSource(config, name);
  const vendor = stagedVendor(name);
  for (const directory of [
    path.join(config, "setup-sources"),
    path.join(config, "setup-sources", name),
    path.join(config, "setup-sources", name, "checkout"),
    source,
  ]) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`Unsafe staged directory: ${directory}`);
  }
  const markerFile = path.join(config, "setup-sources", name, "compatibility.json");
  if (!(await lstat(markerFile)).isFile() || (await lstat(markerFile)).isSymbolicLink())
    throw new Error(`Unsafe staging receipt: ${markerFile}`);
  const marker = JSON.parse(
    await readFile(path.join(config, "setup-sources", name, "compatibility.json"), "utf8"),
  ) as Record<string, unknown>;
  if (
    marker.source !== `https://github.com/${vendor.repository}.git` ||
    marker.subdir !== vendor.subdir ||
    marker.digestVersion !== 2 ||
    typeof marker.revision !== "string" ||
    marker.fingerprint !== (await fingerprint(source))
  )
    throw new Error(
      `Missing, edited or unowned ${name} stage at ${source}. Preserve it and move it aside deliberately before a fresh install.`,
    );
}

export function stagedSource(config: string, name: StagedVendor): string {
  return path.join(config, "setup-sources", name, "checkout", stagedVendor(name).subdir);
}

function git(args: string[], globalConfig: string): string {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      HOME: path.dirname(globalConfig),
      USERPROFILE: path.dirname(globalConfig),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: globalConfig,
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Vendor staging requires Git: ${result.error?.message ?? result.stderr.trim()}`,
    );
  return result.stdout.trim();
}

async function regular(file: string, root: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`Expected regular staging file: ${file}`);
  const relative = path.relative(await realpath(root), await realpath(file));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`Staging file escapes root: ${file}`);
  return readFile(file, "utf8");
}

export async function stageVendor(config: string, name: StagedVendor): Promise<string> {
  const cache = path.join(config, "setup-sources", name);
  const vendor = stagedVendor(name);
  if (await stat(cache)) {
    await validateStage(config, name);
    return stagedSource(config, name);
  }
  const parent = path.dirname(cache);
  await mkdir(parent, { recursive: true });
  if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Unsafe staging parent: ${parent}`);
  const scratch = await mkdtemp(path.join(parent, `.${name}-staging-`));
  const checkout = path.join(scratch, "checkout");
  const source = path.join(checkout, vendor.subdir);
  const globalConfig = path.join(scratch, "gitconfig");
  await writeFile(globalConfig, "", { flag: "wx" });
  const hooks = path.join(scratch, "empty-hooks");
  await mkdir(hooks);
  git(
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
  );
  const revision = git(["-C", checkout, "rev-parse", "HEAD"], globalConfig);
  if (!(await lstat(source)).isDirectory() || (await lstat(source)).isSymbolicLink())
    throw new Error(`Unsafe staged source directory: ${source}`);
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
    )
      throw new Error(
        "pstack root manifest changed; compatibility staging must be reviewed before installation. Staging retained.",
      );
    const claude: unknown = JSON.parse(
      await regular(path.join(source, ".claude-plugin", "plugin.json"), source),
    );
    if (
      typeof claude !== "object" ||
      claude === null ||
      !("name" in claude) ||
      claude.name !== "pstack"
    )
      throw new Error("pstack staging requires its valid Claude manifest.");
    await unlink(rootManifest);
    adjustment = { omittedManifest: original };
  } else {
    const file = path.join(source, "AGENTS.md");
    const info = await lstat(file);
    const target = info.isSymbolicLink() ? await readlink(file) : await regular(file, source);
    if (target.trim() !== "CLAUDE.md")
      throw new Error(
        "Matt Pocock AGENTS.md link changed; compatibility staging must be reviewed.",
      );
    const content = await regular(path.join(source, "CLAUDE.md"), source);
    await unlink(file);
    await writeFile(file, content, { flag: "wx" });
    adjustment = { materialisedLink: { path: "AGENTS.md", target: "CLAUDE.md" } };
  }
  await writeFile(
    path.join(scratch, "compatibility.json"),
    JSON.stringify(
      {
        source: `https://github.com/${vendor.repository}.git`,
        subdir: vendor.subdir,
        revision,
        digestVersion: 2,
        ...adjustment,
        fingerprint: await fingerprint(source),
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  if (await stat(cache)) {
    throw new Error(`Staging target appeared concurrently: ${cache}`);
  }
  await rename(scratch, cache);
  console.log(
    `${name} compatibility staging at ${stagedSource(config, name)}, revision ${revision}; ${name === "pstack" ? "only invalid root plugin.json omitted" : "AGENTS.md -> CLAUDE.md materialised"}`,
  );
  return stagedSource(config, name);
}
