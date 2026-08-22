import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function filesUnder(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function pngSize(path: string) {
  const bytes = readFileSync(join(root, path));
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("favicon metadata contract", () => {
  it("publishes one approved file-based icon family at the app root", () => {
    const metadataAssets = filesUnder("app")
      .filter((path) => /(^|[\\/])(favicon\.ico|icon\d*\.png|apple-icon\d*\.png)$/.test(path))
      .map((path) => relative(root, join(root, path)).replaceAll("\\", "/"));

    expect(metadataAssets.sort()).toEqual([
      "app/apple-icon.png",
      "app/favicon.ico",
      "app/icon.png",
    ]);
    expect(pngSize("app/icon.png")).toEqual({ width: 256, height: 256 });
    expect(pngSize("app/apple-icon.png")).toEqual({ width: 180, height: 180 });
  });

  it("uses a real multi-resolution ICO with browser favicon sizes", () => {
    const bytes = readFileSync(join(root, "app/favicon.ico"));
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    const count = bytes.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, index) => {
      const offset = 6 + index * 16;
      return { width: bytes[offset] || 256, height: bytes[offset + 1] || 256 };
    });

    expect(sizes).toEqual([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
      { width: 256, height: 256 },
    ]);

    const lastEntry = 6 + (count - 1) * 16;
    const lastLength = bytes.readUInt32LE(lastEntry + 8);
    const lastOffset = bytes.readUInt32LE(lastEntry + 12);
    expect(bytes.subarray(lastOffset, lastOffset + lastLength)).toEqual(
      readFileSync(join(root, "app/icon.png")),
    );
  });

  it("does not duplicate file-based icons with manual metadata or a stale manifest", () => {
    const sources = filesUnder("app")
      .filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("__tests__"))
      .map((path) => readFileSync(join(root, path), "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/metadata\.icons|\bicons\s*:/);
    for (const manifest of ["manifest.webmanifest", "site.webmanifest", "manifest.json"]) {
      expect(existsSync(join(root, "public", manifest))).toBe(false);
      expect(existsSync(join(root, "app", manifest))).toBe(false);
    }
  });

  it("keeps icon and discovery metadata outside proxy interception", () => {
    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    for (const path of ["favicon.ico", "icon.png", "apple-icon.png", "robots.txt", "sitemap.xml"]) {
      expect(proxy).toContain(path);
    }
  });
});
