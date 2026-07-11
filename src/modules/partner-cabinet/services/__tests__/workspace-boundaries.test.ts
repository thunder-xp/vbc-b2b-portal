import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

describe("Partner Workspace architecture boundaries", () => {
  it("introduces no direct Supabase access in partner pages or components", async () => {
    const roots = [
      join(projectRoot, "app", "(partner)", "cabinet"),
      join(projectRoot, "src", "modules", "partner-cabinet", "components"),
    ];
    const files = (await Promise.all(roots.map(listSourceFiles))).flat();
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));

    for (const content of contents) {
      expect(content).not.toContain("@supabase/");
      expect(content).not.toContain("lib/supabase");
      expect(content).not.toContain("supabase.from(");
    }
  });
});

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}
