import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { actionClassName } from "../action-styles";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("platform UI regression boundaries", () => {
  it("keeps canonical actions touch-safe and destructive actions visually separate", () => {
    expect(actionClassName.primary).toContain("min-h-11");
    expect(actionClassName.destructive).toContain("text-red-700");
    expect(actionClassName.destructive).not.toContain("bg-emerald-700");
  });

  it("keeps read-only primitives server-rendered and loading motion optional", () => {
    expect(source("src/modules/platform-ui/PageHeader.tsx")).not.toContain('"use client"');
    expect(source("src/modules/platform-ui/EmptyState.tsx")).not.toContain('"use client"');
    expect(source("src/modules/platform-ui/LoadingState.tsx")).toContain("motion-safe:animate-pulse");
  });

  it("uses mobile cards before the internal specification table", () => {
    const page = source("app/(admin)/admin/specifications/page.tsx");
    expect(page).toContain("md:hidden");
    expect(page).toContain("hidden overflow-x-auto");
    expect(page).not.toContain("Internal workspace");
  });

  it("does not introduce broad route invalidation or live integration calls", () => {
    const platformFiles = [
      "src/modules/platform-ui/PageHeader.tsx",
      "src/modules/platform-ui/EmptyState.tsx",
      "src/modules/platform-ui/LoadingState.tsx",
      "src/modules/platform-ui/formatters.ts",
    ].map(source).join("\n");
    expect(platformFiles).not.toMatch(/revalidatePath|fetch\(|supabase|one-c|1c/i);
  });

  it("keeps one bounded responsive shell and CSS-only 4K tiers", () => {
    const css = source("app/globals.css");
    const partnerShell = source("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const adminShell = source("src/modules/admin/components/AdminShell.tsx");

    expect(partnerShell).toContain('className="app-shell');
    expect(adminShell).toContain('className="app-shell');
    expect(partnerShell).toContain('className="app-shell-frame"');
    expect(adminShell).toContain('className="app-shell-frame"');
    expect(css).toContain("@media (min-width: 120rem)");
    expect(css).toContain("@media (min-width: 160rem)");
    expect(css).toContain("--app-shell-max-width: 168rem");
    expect(css).not.toMatch(/(?:^|[;{\s])zoom\s*:|transform\s*:\s*scale\(/);
  });
});
