// oxlint-disable-next-line import/no-nodejs-modules -- This CLI requires native filesystem and process APIs.
import path from "node:path";

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export { contained };
