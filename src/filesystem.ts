import { lstat } from "node:fs/promises";

export async function stat(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
