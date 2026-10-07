// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { readFile, rename, writeFile, unlink } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

import { applyEdits, modify } from "jsonc-parser";

import { isNpmAdapter, localPluginPath, matchesLocalAdapter } from "./adapter.ts";
import { stat } from "./filesystem.ts";
import { sequence } from "./sequence.ts";
import { array, decode, object } from "./values.ts";
import type { ObjectValue } from "./values.ts";

interface Document {
  readonly file: string;
  readonly original: string;
  readonly value: ObjectValue;
}

async function documents(config: string): Promise<Document[]> {
  const docs: Document[] = [];
  await sequence(["opencode.json", "opencode.jsonc"], async (name) => {
    const file = path.join(config, name);
    const info = await stat(file);
    if (info === undefined) {
      return;
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Config must be a regular file: ${file}`);
    }
    const original = await readFile(file, "utf8");
    const value = decode(original, file);
    if (
      value["skills"] !== undefined &&
      (!Array.isArray(value["skills"]) ||
        !value["skills"].every((item: unknown) => typeof item === "string"))
    ) {
      throw new Error(`skills must be a string array in ${file}`);
    }
    if (value["plugins"] !== undefined) {
      if (!Array.isArray(value["plugins"])) {
        throw new TypeError(`plugins must be an array in ${file}`);
      }
      for (const item of value["plugins"]) {
        if (
          typeof item !== "string" &&
          typeof object(item, `plugin in ${file}`)["package"] !== "string"
        ) {
          throw new TypeError(`Invalid plugin entry in ${file}`);
        }
      }
    }
    docs.push({ file, original, value });
  });
  return docs;
}

async function registrationFrom(
  docs: Document[],
  config: string,
  directory: string,
  override: string | undefined,
  parent: string,
) {
  const registrations: { doc: Document; entry: unknown; reference: string; index: number }[] = [];
  await sequence(docs, async (doc) => {
    await sequence(array(doc.value["plugins"]).entries(), async ([index, entry]) => {
      const reference = typeof entry === "string" ? entry : object(entry, "plugin")["package"];
      if (typeof reference !== "string") {
        return;
      }
      const candidate = localPluginPath(reference, config);
      if (
        isNpmAdapter(reference) ||
        (candidate && (await matchesLocalAdapter(candidate, override, directory, parent)))
      ) {
        registrations.push({ doc, entry, index, reference });
      }
    });
  });
  if (registrations.length > 1) {
    throw new Error("Adapter is registered more than once; remove duplicate entries before setup.");
  }
  const [registration] = registrations;
  return registration;
}
function edit(text: string, target: Document, location: (string | number)[], value: unknown) {
  const formattingOptions = {
    eol: target.original.includes("\r\n") ? "\r\n" : "\n",
    insertSpaces: true,
    tabSize: 2,
  };
  return applyEdits(text, modify(text, location, value, { formattingOptions }));
}
async function planConfiguration(
  docs: Document[],
  config: string,
  view: string,
  adapter: { directory: string; reference: string },
  override: string | undefined,
  parent: string,
) {
  const registration = await registrationFrom(docs, config, adapter.directory, override, parent);
  const target = registration?.doc ??
    docs.find((doc) => doc.file.endsWith(".jsonc")) ??
    docs[0] ?? { file: path.join(config, "opencode.jsonc"), original: "{}\n", value: {} };
  let updated = target.original;
  const adapterEntry = adapter.reference;
  if (!registration) {
    updated = edit(
      updated,
      target,
      target.value["plugins"] === undefined ? ["plugins"] : ["plugins", -1],
      target.value["plugins"] === undefined ? [adapterEntry] : adapterEntry,
    );
  } else if (!override || isNpmAdapter(registration.reference)) {
    updated = edit(
      updated,
      target,
      typeof registration.entry === "string"
        ? ["plugins", registration.index]
        : ["plugins", registration.index, "package"],
      adapterEntry,
    );
  }
  if (!docs.some((doc) => array(doc.value["skills"]).includes(view))) {
    updated = edit(
      updated,
      target,
      target.value["skills"] === undefined ? ["skills"] : ["skills", -1],
      target.value["skills"] === undefined ? [view] : view,
    );
  }
  return { target, updated };
}
async function writeConfiguration(target: Document, updated: string) {
  if (updated !== target.original) {
    const targetInfo = await stat(target.file);
    if (targetInfo && (!targetInfo.isFile() || targetInfo.isSymbolicLink())) {
      throw new Error(`Config must be a regular file: ${target.file}`);
    }
    const current = targetInfo ? await readFile(target.file, "utf8") : "{}\n";
    if (current !== target.original) {
      throw new Error(`Configuration changed during setup: ${target.file}`);
    }
    const temporary = `${target.file}.setup-${process.pid}-${crypto.randomUUID()}`;
    await writeFile(temporary, updated, {
      flag: "wx",
      mode: targetInfo?.mode ?? 0o600,
    });
    try {
      await rename(temporary, target.file);
    } finally {
      if (await stat(temporary)) {
        await unlink(temporary);
      }
    }
  }
}
export { documents, planConfiguration, writeConfiguration };
export type { Document };
