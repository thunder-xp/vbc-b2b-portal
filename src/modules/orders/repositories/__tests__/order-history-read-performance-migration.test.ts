import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260804090000_partner_order_history_read_performance.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("partner order-history read performance migration", () => {
  it("evaluates tenant permission once inside bounded security-definer RPCs", () => {
    expect(migration).toContain("get_partner_order_history_identity_matches");
    expect(migration).toContain("get_partner_order_history_page");
    expect(migration.match(/not public\.has_permission\(p_company_id, 'orders\.view'\)/g)).toHaveLength(2);
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("p_limit > 100");
  });

  it("keeps exact filtering, deterministic pagination, and restricted grants", () => {
    expect(migration).toContain("select count(*)");
    expect(migration).toContain("order by history.one_c_document_date desc, history.id");
    expect(migration).toContain("offset p_offset");
    expect(migration).toContain("limit p_limit");
    expect(migration).toContain("revoke all on function public.get_partner_order_history_page");
    expect(migration).toContain("grant execute on function public.get_partner_order_history_page");
    expect(migration).not.toContain("grant execute on function public.get_partner_order_history_page(uuid, text, text, integer, integer) to anon");
  });
});
