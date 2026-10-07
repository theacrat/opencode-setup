// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import {
  lstat,
  readFile,
  readdir,
  readlink,
  symlink,
  mkdir,
  unlink,
  writeFile,
  rename,
} from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { stat } from "./filesystem.ts";
import { SOURCES } from "./native-sources.ts";
import type { NativeSource } from "./native-sources.ts";
import { contained } from "./paths.ts";
import type { Environment } from "./platform.ts";
import { sequence } from "./sequence.ts";
import { fingerprint, git, gitWorkspace } from "./staging.ts";
import { object } from "./values.ts";

interface Skill {
  readonly name: string;
  readonly directory: string;
  readonly previous: string;
}
function sourceCache(config: string, source: NativeSource): string {
  return path.join(config, "setup-native-sources", source.name);
}
async function directory(file: string) {
  const info = await lstat(file);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Unsafe native source directory: ${file}`);
  }
}
async function validateSkills(checkout: string, source: NativeSource) {
  await sequence(source.skills, async (skill) => {
    const parts = skill.directory.split("/");
    await sequence(
      parts.map((_part, index) => parts.slice(0, index + 1)),
      async (segments) => {
        await directory(path.join(checkout, ...segments));
      },
    );
    const file = path.join(checkout, skill.directory, "SKILL.md");
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Unsafe native skill file: ${file}`);
    }
  });
}
async function validateSnapshot(config: string, source: NativeSource) {
  const cache = sourceCache(config, source);
  const checkout = path.join(cache, "checkout");
  await directory(cache);
  await directory(checkout);
  const markerFile = path.join(cache, "source.json");
  const info = await lstat(markerFile);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Unsafe native source receipt: ${markerFile}`);
  }
  const marker = object(JSON.parse(await readFile(markerFile, "utf8")), "native source receipt");
  if (
    marker["source"] !== `https://github.com/${source.repository}.git` ||
    marker["digestVersion"] !== 3 ||
    typeof marker["revision"] !== "string" ||
    !/^[a-f0-9]{40,64}$/u.test(marker["revision"]) ||
    marker["fingerprint"] !== (await fingerprint(checkout, true))
  ) {
    throw new Error(
      `Edited or unowned native snapshot: ${cache}. Preserve it and move it aside deliberately before reinstalling.`,
    );
  }
  await validateSkills(checkout, source);
}
async function skillsFrom(config: string, previousRoot: string): Promise<Skill[]> {
  const parent = path.join(config, "setup-native-sources");
  if (await stat(parent)) {
    await directory(parent);
  }
  await sequence(SOURCES, async (source) => {
    if (await stat(sourceCache(config, source))) {
      await validateSnapshot(config, source);
    }
  });
  const bundled = path.resolve(import.meta.dirname, "../skills/thea-mode");
  await directory(bundled);
  await fingerprint(bundled);
  const bundledInfo = await lstat(path.join(bundled, "SKILL.md"));
  if (!bundledInfo.isFile() || bundledInfo.isSymbolicLink()) {
    throw new Error("Missing bundled thea-mode SKILL.md");
  }
  return [
    ...SOURCES.flatMap((source) =>
      source.skills.map((skill) => ({
        directory: path.join(sourceCache(config, source), "checkout", skill.directory),
        name: skill.name,
        previous: path.join(previousRoot, "sources", source.previous, skill.directory),
      })),
    ),
    {
      directory: bundled,
      name: "thea-mode",
      previous: path.join(previousRoot, "personal/skills/thea-mode"),
    },
  ];
}
function resolveTarget(
  root: string,
  targets: Map<string, string>,
  file: string,
  seen: Set<string>,
): string {
  if (!contained(root, file) || seen.has(file)) {
    throw new Error(`Unsafe native source link: ${file}`);
  }
  const target = targets.get(file);
  if (target === undefined) {
    return file;
  }
  if (path.isAbsolute(target)) {
    throw new Error(`Unsafe absolute native source link: ${file}`);
  }
  seen.add(file);
  return resolveTarget(root, targets, path.resolve(path.dirname(file), target), seen);
}
async function materialiseLinks(
  root: string,
  globalConfig: string,
  env: Environment,
): Promise<{ path: string; target: string }[]> {
  const tree = await git(["-C", root, "ls-tree", "-rz", "HEAD"], globalConfig, env);
  if (
    tree
      .split("\0")
      .some((entry) => entry !== "" && !/^(?:100644|100755|120000) blob /u.test(entry))
  ) {
    throw new Error("Unsafe native source tree mode; submodules are not supported");
  }
  const links = tree
    .split("\0")
    .filter((entry) => entry.startsWith("120000 blob "))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  const targets = new Map<string, string>();
  await sequence(links, async (relative) => {
    const file = path.resolve(root, relative);
    if (!contained(root, file)) {
      throw new Error(`Unsafe native source link path: ${relative}`);
    }
    targets.set(file, await readFile(file, "utf8"));
  });
  const materials: { file: string; content: Buffer; mode: number }[] = [];
  await sequence(targets.keys(), async (file) => {
    const resolved = resolveTarget(root, targets, file, new Set());
    const info = await lstat(resolved);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Unsafe native source link target: ${file}`);
    }
    materials.push({ content: await readFile(resolved), file, mode: info.mode });
  });
  await sequence(materials, async (material) => {
    await unlink(material.file);
    await writeFile(material.file, material.content, { flag: "wx", mode: material.mode });
  });
  return [...targets].map(([file, target]) => ({ path: path.relative(root, file), target }));
}
async function publishSource(
  scratch: string,
  checkout: string,
  source: NativeSource,
  revision: string,
  links: { path: string; target: string }[],
  cache: string,
) {
  await writeFile(
    path.join(scratch, "source.json"),
    JSON.stringify(
      {
        digestVersion: 3,
        fingerprint: await fingerprint(checkout, true),
        materialisedLinks: links,
        revision,
        source: `https://github.com/${source.repository}.git`,
      },
      undefined,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  if (await stat(cache)) {
    throw new Error(`Native snapshot appeared concurrently: ${cache}`);
  }
  await rename(scratch, cache);
  console.log(`Native snapshot ${source.repository}, revision ${revision}`);
}
async function downloadSource(config: string, source: NativeSource, env: Environment) {
  const cache = sourceCache(config, source);
  const { scratch, globalConfig, hooks } = await gitWorkspace(
    path.dirname(cache),
    `.${source.name}-download-`,
  );
  const checkout = path.join(scratch, "checkout");
  await git(
    [
      "-c",
      `core.hooksPath=${hooks}`,
      "clone",
      "--template=",
      "--depth",
      "1",
      "--no-checkout",
      "--",
      `https://github.com/${source.repository}.git`,
      checkout,
    ],
    globalConfig,
    env,
  );
  const revision = await git(["-C", checkout, "rev-parse", "HEAD"], globalConfig, env);
  // Git writes link text as regular files, so Windows needs no symlink privilege and extraction cannot follow upstream links.
  await git(
    [
      "-C",
      checkout,
      "-c",
      "core.symlinks=false",
      "-c",
      `core.hooksPath=${hooks}`,
      "checkout",
      "--force",
      "HEAD",
    ],
    globalConfig,
    env,
  );
  const links = await materialiseLinks(checkout, globalConfig, env);
  await rename(path.join(checkout, ".git"), path.join(scratch, "git-metadata"));
  await validateSkills(checkout, source);
  await publishSource(scratch, checkout, source, revision, links, cache);
}
async function prepareSources(config: string, env: Environment, dryRun: boolean) {
  await sequence(SOURCES, async (source) => {
    const cache = sourceCache(config, source);
    if (await stat(cache)) {
      await validateSnapshot(config, source);
    } else if (dryRun) {
      console.log(
        `Would download native ${source.repository} into ${cache}. No retrieval performed.`,
      );
    } else {
      await downloadSource(config, source, env);
    }
  });
}
async function validateView(view: string, skills: Skill[]) {
  const info = await stat(view);
  if (!info) {
    return;
  }
  await directory(view);
  await sequence(await readdir(view), async (name) => {
    const link = path.join(view, name);
    const skill = skills.find((candidate) => candidate.name === name);
    const linkInfo = await stat(link);
    const target = linkInfo?.isSymbolicLink()
      ? path.resolve(view, await readlink(link))
      : undefined;
    if (!skill || (target !== skill.directory && target !== skill.previous)) {
      throw new Error(
        `Conflicting native skill view entry: ${link}. Preserve it and move it aside deliberately; it will not be overwritten.`,
      );
    }
  });
}
async function createView(view: string, skills: Skill[]) {
  await validateView(view, skills);
  await mkdir(view, { recursive: true });
  await sequence(skills, async (skill) => {
    const link = path.join(view, skill.name);
    if (await stat(link)) {
      if (path.resolve(view, await readlink(link)) === skill.directory) {
        return;
      }
      await unlink(link);
    }
    await symlink(skill.directory, link, process.platform === "win32" ? "junction" : "dir");
  });
}
export { skillsFrom, validateView, createView, prepareSources };
