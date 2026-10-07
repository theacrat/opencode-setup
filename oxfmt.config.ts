import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["skills/thea-mode/**"],
  sortImports: true,
  sortPackageJson: {
    sortScripts: true,
  },
  sortTailwindcss: {
    functions: ["tv"],
  },
});
