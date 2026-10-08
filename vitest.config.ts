import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    hookTimeout: 30_000,
    testTimeout: 60_000,
  },
});
