import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : collectSourceFiles(absolute);
    return /\.(?:css|ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [absolute] : [];
  });
}

describe("platform typography standard", () => {
  it("registers Inter once at the application root with required subsets and weights", () => {
    const layout = read("app/layout.tsx");
    const fontRegistrations = [path.join(root, "app"), path.join(root, "src")]
      .flatMap(collectSourceFiles)
      .filter((file) => fs.readFileSync(file, "utf8").includes('from "next/font'))
      .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));

    expect(fontRegistrations).toEqual(["app/layout.tsx"]);
    expect(layout).toContain('import { Inter } from "next/font/google"');
    expect(layout).toContain('subsets: ["cyrillic", "latin"]');
    expect(layout).toContain('weight: ["400", "500", "600", "700"]');
    expect(layout).toContain('variable: "--font-inter"');
    expect(layout).toContain('data-app-font="Inter"');
    expect(layout).not.toContain("IBM_Plex_Sans");
  });

  it("makes public and authenticated UI inherit Inter with safe fallbacks", () => {
    const css = read("app/globals.css");
    const partnerLayout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");

    expect(css).toContain("--font-app-sans: var(--font-inter), Inter, system-ui, sans-serif;");
    expect(css).toContain("font-family: var(--font-app-sans);");
    expect(partnerLayout).not.toContain("font-[family-name:");
    expect(partnerLayout).not.toContain("font-partner-cabinet");
  });

  it("uses Inter tabular numerals globally without replacing document-specific fonts", () => {
    const css = read("app/globals.css");

    expect(css).toContain("font-variant-numeric: tabular-nums;");
    expect(read("src/modules/estimates/services/proposal-pdf.renderer.ts")).toContain('font: "Roboto"');
    expect(read("src/modules/auth/send-email-hook.service.ts")).toContain("font-family:Arial,sans-serif");
  });
});
