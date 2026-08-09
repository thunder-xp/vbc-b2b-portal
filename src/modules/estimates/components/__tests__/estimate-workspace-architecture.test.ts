import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const editor = readFileSync(resolve("src/modules/estimates/components/EstimateCommercialEditor.tsx"), "utf8");
const page = readFileSync(resolve("app/(partner)/cabinet/estimates/[estimateId]/page.tsx"), "utf8");

describe("estimate workspace architecture", () => {
  it("keeps existing reads parallel and introduces no browser data provider", () => {
    expect(page).toContain("await Promise.all");
    expect(page).toContain("getEstimateAction(estimateId)");
    expect(editor).not.toMatch(/createClient|supabase|fetch\(|1C|ОData/);
  });

  it("uses a bounded responsive canvas instead of the overflowing fixed line grid", () => {
    expect(editor).toContain("grid grid-cols-2 items-start gap-2 sm:grid-cols-4 xl:grid-cols-[1.5rem_1.5rem_minmax(12rem,1fr)_4.75rem_4.75rem_6rem_5rem_7rem_4.5rem]");
    expect(editor).toContain("xl:grid-cols-[minmax(0,1fr)_20rem]");
    expect(editor).not.toContain("lg:grid-cols-12 lg:items-end");
    expect(editor).not.toContain("md:grid-cols-[1.5rem_2.5rem_minmax(12rem,1fr)");
  });

  it("keeps proposal versions and the existing workflow panel in the canonical route", () => {
    expect(page).toContain("EstimateWorkflowPanel");
    expect(page).toContain('id="proposal-versions"');
  });
});
