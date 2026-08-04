import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type LockPackage = { version?: string };
type PackageLock = { packages: Record<string, LockPackage> };

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as PackageLock;

describe("dependency security baseline", () => {
  it("pins the patched Next.js and React runtime", () => {
    expect(manifest.dependencies.next).toBe("16.3.0");
    expect(manifest.dependencies.react).toBe("19.2.8");
    expect(manifest.dependencies["react-dom"]).toBe("19.2.8");
    expect(manifest.devDependencies["eslint-config-next"]).toBe("16.3.0");
  });

  it("contains one React runtime version", () => {
    const versions = Object.entries(lock.packages)
      .filter(([path]) => /node_modules\/react(?:-dom)?$/.test(path))
      .map(([, entry]) => entry.version);

    expect(new Set(versions)).toEqual(new Set(["19.2.8"]));
  });

  it("retains the audited transitive security patches", () => {
    expect(lock.packages["node_modules/next/node_modules/postcss"]?.version ?? lock.packages["node_modules/postcss"]?.version).toBe("8.5.23");
    expect(lock.packages["node_modules/sharp"]?.version).toBe("0.35.3");
    expect(lock.packages["node_modules/undici"]?.version).toBe("7.29.0");
    expect(lock.packages["node_modules/brace-expansion"]?.version).toBe("1.1.18");
    expect(lock.packages["node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion"]?.version).toBe("5.0.9");
  });
});
