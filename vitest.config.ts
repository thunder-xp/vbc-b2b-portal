import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    hookTimeout: 15_000,
    include: ["app/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    maxWorkers: 8,
    setupFiles: ["./vitest.setup.ts"],
    teardownTimeout: 5_000,
    testTimeout: 15_000,
  },
});
