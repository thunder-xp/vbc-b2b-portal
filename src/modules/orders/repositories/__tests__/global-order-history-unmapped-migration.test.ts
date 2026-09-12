import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(
  process.cwd(),
  "supabase/migrations/20260912120917_global_b2b_order_history_unmapped_counterparties.sql",
), "utf8");

describe("global B2B order-history migration", () => {
  it("decouples canonical buyer identity from optional portal mapping", () => {
    expect(sql).toContain("add column source_counterparty_1c_id text");
    expect(sql).toContain("alter column source_counterparty_1c_id set not null");
    expect(sql).toContain("alter column company_id drop not null");
    expect(sql).toContain("company_id is not null\n      and partner_visible");
  });

  it("defines the governed B2B eligibility without current portal activity", () => {
    expect(sql).toContain("source_operation_code = 'ЗаказНаПродажу'");
    expect(sql).toContain("'ЮридическоеЛицо'");
    expect(sql).toContain("'ИндивидуальныйПредприниматель'");
    expect(sql).toContain("one_c_posted\n    and not one_c_deletion_mark");
  });

  it("keeps global import bounded, resumable, and idempotent", () => {
    expect(sql).toContain("jsonb_array_length(p_headers) > 1000");
    expect(sql).toContain("jsonb_array_length(p_items) > 1000");
    expect(sql).toContain("global_history_header_checkpoint_conflict");
    expect(sql).toContain("global_history_item_checkpoint_conflict");
    expect(sql).toContain("on conflict (external_1c_order_ref) do update");
    expect(sql).toContain("on conflict (order_history_id, line_number) do update");
  });

  it("provides only a service-role aggregate analytics path", () => {
    expect(sql).toContain("get_global_b2b_order_product_membership");
    expect(sql).toMatch(/revoke all on function[\s\S]*get_global_b2b_order_product_membership[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function[\s\S]*get_global_b2b_order_product_membership[\s\S]*to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.get_global_b2b_order_product_membership[\s\S]*to authenticated/);
  });

  it("keeps nullable-company changes out of company-scoped projection queues", () => {
    expect(sql).toContain("if target_company_id is not null then");
    expect(sql).toContain("where history.company_id is not null");
  });
});
