import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/modules/estimates/repositories/supabase/estimate.supabase-repository.ts"), "utf8");

describe("archived estimate deletion projection", () => {
  it("loads protected dependencies in bounded batches for the current page", () => {
    expect(source).toContain('supabase.from("estimate_cart_conversions").select("estimate_id").in("estimate_id", estimateIds)');
    expect(source).toContain('supabase.from("estimate_proposal_deliveries").select("estimate_id").in("estimate_id", estimateIds)');
    expect(source).toContain('supabase.from("estimate_lifecycle_events").select("estimate_id, to_status").in("estimate_id", estimateIds).neq("to_status", "draft")');
    expect(source).toContain("!protectedEstimateIds.has(row.id)");
  });

  it("does not rely on embedded aggregate counts for deletion eligibility", () => {
    expect(source).not.toContain("estimate_proposal_deliveries(count)");
    expect(source).not.toContain("estimate_cart_conversions(count)");
    expect(source).not.toContain("estimate_lifecycle_events(count)");
  });
});
