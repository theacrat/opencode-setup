// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import { lstat } from "node:fs/promises";

export async function stat(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}
