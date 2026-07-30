import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730145000_product_notification_projection_runtime_repair.sql",
  ),
  "utf8",
).toLowerCase();

describe("product notification projection runtime repair", () => {
  it("returns a successful empty result without entering projection work", () => {
    expect(sql).toContain("if transition_count = 0 then");
    expect(sql).toContain("'transitionsprocessed', 0");
    expect(sql).toMatch(
      /create temporary table product_transition_batch[\s\S]+if transition_count = 0 then[\s\S]+begin\s+update public\.partner_product_transition_events/,
    );
  });

  it("keeps the transition batch visible to the exception handler", () => {
    expect(sql).toContain(
      "where transition.id in (select id from product_transition_batch)",
    );
    expect(sql).toContain("exception when others then");
    expect(sql).toContain("safe_error_code = sqlstate");
  });
});
