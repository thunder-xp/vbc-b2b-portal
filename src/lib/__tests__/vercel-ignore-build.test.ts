import { describe, expect, it } from "vitest";

import { isDocumentationOnly } from "../../../scripts/vercel-ignore-build.mjs";

describe("Vercel build ignore policy", () => {
  it("skips a bounded documentation-only commit", () => {
    expect(isDocumentationOnly(["AGENTS.md", "docs/engineering/release-economics.md"])).toBe(true);
  });

  it.each([
    [["app/catalog/page.tsx"]],
    [["vercel.json"]],
    [["docs/release.md", "src/lib/cron-auth.ts"]],
    [[]],
  ])("fails safe and builds when the change can affect runtime: %j", (paths) => {
    expect(isDocumentationOnly(paths)).toBe(false);
  });
});
