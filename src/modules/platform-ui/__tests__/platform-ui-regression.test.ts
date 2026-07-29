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
});
