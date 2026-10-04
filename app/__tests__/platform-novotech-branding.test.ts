import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function collectActiveUiFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : collectActiveUiFiles(absolute);
    return /\.(?:ts|tsx|css)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [absolute] : [];
  });
}

describe("canonical NOVOTECH platform branding", () => {
  it("contains no erroneous ONEST brand in active application UI", () => {
    const activeUiFiles = [path.join(root, "app"), path.join(root, "src")]
      .flatMap(collectActiveUiFiles);
    const occurrences = activeUiFiles
      .filter((file) => /\bONEST\b/i.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
    const retailSubBrandOccurrences = activeUiFiles
      .filter((file) => /Novotech Retail/i.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));

    expect(occurrences).toEqual([]);
    expect(retailSubBrandOccurrences).toEqual([]);
  });

  it("uses the official public logo assets and canonical distribution lockup", () => {
    const publicShell = read("src/modules/public-retail/components/PublicRetailShell.tsx");

    expect(publicShell).toContain("/brand/source/novotech-logo-${background}-original.webp");
    expect(publicShell).toContain("NOVOTECH SYSTEMS");
    expect(publicShell).toContain("DISTRIBUTION");
  });

  it("identifies every authenticated shell as NOVOTECH", () => {
    expect(read("src/modules/partner-cabinet/components/PartnerSidebar.tsx")).toContain(">NOVOTECH</p>");
    expect(read("app/(agent)/agent/layout.tsx")).toContain("NOVOTECH · {copy.cabinet}");
    expect(read("src/modules/admin/components/AdminShell.tsx")).toContain(">NOVOTECH</span>");
  });

  it("keeps the governed legal merchant identity unchanged", () => {
    expect(read("src/modules/public-retail/legal/public-legal-content.ts")).toContain("NOVOTECH SYSTEMS S.R.L.");
  });
});
