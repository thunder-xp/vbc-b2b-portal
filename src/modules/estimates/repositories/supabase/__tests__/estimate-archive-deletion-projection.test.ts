import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/modules/estimates/repositories/supabase/estimate.supabase-repository.ts"), "utf8");

describe("archived estimate deletion projection", () => {
  it("does not load historical dependencies to decide creator/owner deletion rights", () => {
    expect(source).not.toContain('supabase.from("estimate_cart_conversions").select("estimate_id").in("estimate_id", estimateIds)');
    expect(source).not.toContain('supabase.from("estimate_proposal_deliveries")');
    expect(source).not.toContain('supabase.from("estimate_lifecycle_events")');
    expect(source).not.toContain("protectedEstimateIds");
    expect(source).not.toContain("canDeleteArchived:");
  });

  it("does not rely on embedded aggregate counts for deletion eligibility", () => {
    expect(source).not.toContain("estimate_proposal_deliveries(count)");
    expect(source).not.toContain("estimate_cart_conversions(count)");
    expect(source).not.toContain("estimate_lifecycle_events(count)");
  });
});
