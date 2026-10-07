// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { readFile, readdir, realpath, symlink, mkdir } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { stat } from "./filesystem.ts";
import { contained } from "./paths.ts";
import { sequence } from "./sequence.ts";
import { object } from "./values.ts";
import { VENDORS } from "./vendors.ts";

interface Skill {
  readonly name: string;
  readonly directory: string;
}
function segment(name: unknown): string {
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) || name.length > 64) {
    throw new Error(`Invalid skill alias: ${String(name)}`);
  }
  return name;
}

async function findDirectory(root: string, candidates: string[]): Promise<string | undefined> {
  const [candidate, ...remaining] = candidates;
  if (candidate === undefined) {
    return;
  }
  if (contained(root, candidate)) {
    const info = await stat(path.join(candidate, "SKILL.md"));
    if (info?.isFile()) {
      return candidate;
    }
  }
  return findDirectory(root, remaining);
}

async function resolveSkill(root: string, entry: unknown): Promise<Skill | undefined> {
  const source = object(entry, "sources.json skill");
  const name = segment(source["name"]);
  const sourcePath = source["path"];
  const declaredRoot = source["root"];
  if (typeof declaredRoot !== "string" || typeof sourcePath !== "string") {
    throw new TypeError(`Missing root/path for ${name}`);
  }
  const sourceRoot = path.resolve(root, declaredRoot);
  const origin = path.relative(root, sourceRoot).replaceAll("\\", "/");
  if (
    VENDORS.some((vendor) =>
      vendor.excludedRoots.some(
        (excluded) => origin === excluded || origin.startsWith(`${excluded}/`),
      ),
    )
  ) {
    return;
  }
  if (!contained(root, sourceRoot) || path.isAbsolute(sourcePath)) {
    throw new Error(`Unsafe source path for ${name}`);
  }
  const candidates = [path.resolve(sourceRoot, sourcePath), path.resolve(root, sourcePath)];
  const directory = await findDirectory(sourceRoot, candidates);
  if (directory === undefined) {
    throw new Error(`Cannot resolve ${name} from root ${declaredRoot} and path ${sourcePath}`);
  }
  if (!contained(await realpath(sourceRoot), await realpath(directory))) {
    throw new Error(`Skill escapes declared source root: ${name}`);
  }
  return { directory, name };
}

async function addSkill(root: string, skills: Map<string, Skill>, skill: Skill) {
  const canonical = await realpath(skill.directory);
  if (!contained(root, canonical)) {
    throw new Error(`Skill escapes ai-config checkout: ${skill.directory}`);
  }
  const directoryInfo = await stat(canonical);
  const skillInfo = await stat(path.join(canonical, "SKILL.md"));
  if (!directoryInfo?.isDirectory() || !skillInfo?.isFile()) {
    throw new Error(`Missing skill directory or SKILL.md: ${skill.directory}`);
  }
  if (skills.has(skill.name)) {
    throw new Error(`Duplicate native skill alias: ${skill.name}`);
  }
  skills.set(skill.name, { directory: canonical, name: skill.name });
}

async function skillsFrom(checkout: string): Promise<Skill[]> {
  const root = await realpath(checkout);
  const text = await readFile(path.join(root, "sources.json"), "utf8");
  const data = object(JSON.parse(text), "sources.json");
  if (!Array.isArray(data["skills"])) {
    throw new TypeError("sources.json skills must be an array");
  }
  const skills = new Map<string, Skill>();
  await sequence(data["skills"], async (entry: unknown) => {
    const skill = await resolveSkill(root, entry);
    if (skill) {
      await addSkill(root, skills, skill);
    }
  });
  const personal = path.join(root, "personal", "skills");
  const info = await stat(personal);
  if (info?.isDirectory()) {
    await sequence(await readdir(personal, { withFileTypes: true }), async (entry) => {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        await addSkill(root, skills, {
          directory: path.join(personal, entry.name),
          name: segment(entry.name),
        });
      }
    });
  }
  return [...skills.values()].toSorted((first, second) => first.name.localeCompare(second.name));
}

async function validateView(view: string, skills: Skill[]) {
  const info = await stat(view);
  if (info === undefined) {
    return;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Native skill view must be a regular directory: ${view}`);
  }
  const expected = new Map(skills.map((skill) => [skill.name, skill.directory]));
  await sequence(await readdir(view), async (name) => {
    const link = path.join(view, name);
    const linkInfo = await stat(link);
    if (
      !linkInfo?.isSymbolicLink() ||
      !expected.has(name) ||
      (await realpath(link)) !== expected.get(name)
    ) {
      throw new Error(
        `Conflicting native skill view entry: ${link}. Move the old view aside and rerun; it will not be overwritten.`,
      );
    }
  });
}

async function createView(view: string, skills: Skill[]) {
  await mkdir(view, { recursive: true });
  await sequence(skills, async (skill) => {
    const link = path.join(view, skill.name);
    if (!(await stat(link))) {
      await symlink(skill.directory, link, process.platform === "win32" ? "junction" : "dir");
    }
  });
}
export { skillsFrom, validateView, createView };
