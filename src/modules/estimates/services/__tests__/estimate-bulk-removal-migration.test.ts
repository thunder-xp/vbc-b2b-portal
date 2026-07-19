import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260719150000_estimate_bulk_line_removal.sql"), "utf8");

describe("estimate bulk line removal migration", () => {
  it("keeps removal company-authorized, bounded, revision-protected, and atomic", () => {
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(sql).toContain("target.revision <> expected_revision");
    expect(sql).toContain("requested_count > 100");
    expect(sql).toContain("id = any(target_item_ids)");
    expect(sql).toContain("perform public.recalculate_estimate_totals(target.id)");
    expect(sql).toContain("grant execute on function public.remove_estimate_items(uuid, uuid[], integer) to authenticated");
    expect(sql).not.toContain("using (true)");
  });
});
