import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("purchase template permission scope repair", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260731203000_purchase_template_permission_scope_repair.sql"),
    "utf8",
  );

  it("makes all purchase-template permissions available to canonical partner and internal projections", () => {
    expect(sql).toContain("set scope = 'both'");
    expect(sql.match(/'purchase_templates\.[a-z_]+'/g)).toHaveLength(6);
    expect(sql).not.toMatch(/insert into public\.role_permissions/i);
  });

  it("repairs the list aggregate without grouping a CTE row by only its id", () => {
    const aggregateSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260731204000_purchase_template_list_aggregate_repair.sql"),
      "utf8",
    );

    expect(aggregateSql).toContain("cross join lateral");
    expect(aggregateSql).not.toMatch(/group by template\.id/i);
    expect(aggregateSql).toContain("limit target_limit offset target_offset");
  });

  it("expands create items with valid ordinality syntax", () => {
    const createSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260731205000_purchase_template_create_ordinality_repair.sql"),
      "utf8",
    );

    expect(createSql).toContain("jsonb_array_elements(target_items) with ordinality element(value, ordinality)");
    expect(createSql).not.toMatch(/jsonb_to_recordset\(target_items\) with ordinality row/i);
  });
});
