import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260806100000_dashboard_offer_candidate_pool.sql"),
  "utf8",
);
const repairSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260806101000_dashboard_offer_candidate_constraint_repair.sql"),
  "utf8",
);

describe("dashboard offer candidate pool migration", () => {
  it("expands only the bounded pre-deduplication pool", () => {
    expect(sql).toContain("cardinality(offer_product_ids) <= 12");
    expect(sql).toContain("drop constraint if exists partner_dashboard_selection_snapshots_offer_product_ids_check");
    expect(sql).toContain("order by rank limit 12");
    expect(sql).toContain("order by rank limit 5");
  });

  it("repairs the auto-generated production constraint name idempotently", () => {
    expect(repairSql).toContain("drop constraint if exists partner_dashboard_selection_snapshots_offer_product_ids_check");
    expect(repairSql).toContain("cardinality(offer_product_ids) <= 12");
  });

  it("fails safely when the expected governed function is unavailable", () => {
    expect(sql).toContain("current_definition is null");
    expect(sql).toContain("updated_definition = current_definition");
  });
});
