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
    globals: false,
    hookTimeout: 15_000,
    maxWorkers: 8,
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          exclude: ["src/modules/catalog/components/__tests__/comparison-storage.test.ts"],
          include: ["app/**/*.test.ts", "src/**/*.test.ts"],
          name: "node",
        },
      },
      {
        extends: true,
        test: {
          environment: "jsdom",
          include: [
            "app/**/*.test.tsx",
            "src/**/*.test.tsx",
            "src/modules/catalog/components/__tests__/comparison-storage.test.ts",
          ],
          name: "jsdom",
        },
      },
    ],
    setupFiles: ["./vitest.setup.ts"],
    teardownTimeout: 5_000,
    testTimeout: 15_000,
  },
});
