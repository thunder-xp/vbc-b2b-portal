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
  it("uses the original system UI stack without a custom font registration", () => {
    const layout = read("app/layout.tsx");
    const fontRegistrations = [path.join(root, "app"), path.join(root, "src")]
      .flatMap(collectSourceFiles)
      .filter((file) => fs.readFileSync(file, "utf8").includes('from "next/font'))
      .map((file) => path.relative(root, file).replaceAll(path.sep, "/"));

    expect(fontRegistrations).toEqual([]);
    expect(layout).not.toContain("next/font");
    expect(layout).not.toMatch(/Inter(?:_Tight)?|IBM_Plex_Sans|Onest/i);
    expect(layout).toContain('data-app-font="System UI"');
  });

  it("makes public and authenticated UI inherit the exact system UI stack", () => {
    const css = read("app/globals.css");
    const partnerLayout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");

    expect(css).toContain(
      '--font-app-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    );
    expect(css).toContain("font-family: var(--font-app-sans);");
    expect(css).toContain("font-size: 14px;");
    expect(css).toContain("line-height: 1.35;");
    expect(partnerLayout).not.toContain("font-[family-name:");
    expect(partnerLayout).not.toContain("font-partner-cabinet");
  });

  it("uses tabular numerals globally without replacing document-specific fonts", () => {
    const css = read("app/globals.css");

    expect(css).toContain("font-variant-numeric: tabular-nums;");
    expect(read("src/modules/estimates/services/proposal-pdf.renderer.ts")).toContain('font: "Roboto"');
    expect(read("src/modules/auth/send-email-hook.service.ts")).toContain("font-family:Arial,sans-serif");
  });
});
