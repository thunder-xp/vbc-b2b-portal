import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260806110000_purchasing_list_ordinality_repair.sql",
  "utf8",
);

describe("purchasing list ordinality repair", () => {
  it("preserves JSON array order without invalid recordset syntax", () => {
    expect(sql).toContain("jsonb_array_elements(target_items) with ordinality entry(value, ordinality)");
    expect(sql).toContain("cross join lateral jsonb_to_record(entry.value)");
    expect(sql).not.toContain("jsonb_to_recordset(target_items) with ordinality");
  });

  it("keeps the governed signature and access checks", () => {
    expect(sql).toContain("public.has_permission(target_company_id, 'purchasing_lists.manage')");
    expect(sql).toContain("grant execute on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) to authenticated");
    expect(sql).toContain("count(distinct row.product_id)");
  });
});
