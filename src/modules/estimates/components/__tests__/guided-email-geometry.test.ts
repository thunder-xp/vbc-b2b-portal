import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/modules/estimates/components/SendProposalDialog.tsx"), "utf8");

describe("guided Estimate email geometry", () => {
  it("uses a mobile bottom sheet with safe-area padding and 44px controls", () => {
    expect(source).toContain("items-end");
    expect(source).toContain("rounded-t-2xl");
    expect(source).toContain("100dvh");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("min-h-11");
  });

  it("keeps the same compact disclosure on tablet and desktop", () => {
    expect(source).toContain("sm:items-center");
    expect(source).toContain("sm:max-w-lg");
    expect(source).toContain("<details");
    expect(source).toContain("copy.advanced");
    expect(source).not.toMatch(/type="file"|mailto:/i);
  });
});
