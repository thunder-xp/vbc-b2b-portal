import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("proposal image projection", () => {
  it("bulk-selects only image identity fields and prefers the current source URL", () => {
    const source = readFileSync("src/modules/estimates/repositories/supabase/proposal.supabase-repository.ts", "utf8");
    expect(source).toContain('select("id, image_source_url, image_url")');
    expect(source).toContain("row.image_source_url ?? row.image_url");
    expect(source).not.toMatch(/for\s*\([^)]*productIds[^)]*\)[\s\S]{0,200}\.from\("catalog_products"\)/);
  });
});
