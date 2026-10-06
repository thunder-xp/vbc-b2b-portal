import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20261006200000_cart_purchasing_list_authority.sql"),
  "utf8",
).toLowerCase();

describe("cart-sourced purchasing-list authority migration", () => {
  it("locks and authorizes the exact actor-owned active cart", () => {
    expect(sql).toContain("auth.uid() is null or target_source_reference_id is null");
    expect(sql).toContain("public.has_permission(target_company_id, 'purchasing_lists.manage')");
    expect(sql).toContain("from public.carts");
    expect(sql).toContain("for update");
    expect(sql).toContain("authoritative_cart.company_id <> target_company_id");
    expect(sql).toContain("authoritative_cart.created_by <> auth.uid()");
    expect(sql).toContain("authoritative_cart.status <> 'active'");
  });

  it("requires exact grouped product intent across every cart context", () => {
    expect(sql).toContain("sum(item.quantity)::integer as quantity");
    expect(sql).toContain("full join authoritative using (product_id)");
    expect(sql).toContain("submitted.quantity is distinct from authoritative.quantity");
    expect(sql).toContain("count(distinct row.product_id)");
    expect(sql).toContain("(entry.value ->> 'quantity') !~ '^[0-9]+$'");
  });

  it("derives cart provenance and normal Partner pricing server-side", () => {
    const cartInsert = sql.slice(
      sql.indexOf("if target_source_type = 'cart' then", sql.indexOf("insert into public.purchasing_lists")),
      sql.indexOf("\n  else\n    insert into public.purchasing_list_items", sql.indexOf("insert into public.purchasing_lists")),
    );
    expect(cartInsert).toContain("authoritative_cart.id");
    expect(cartInsert).toContain("candidate.external_1c_price_type_id = company.external_1c_price_type_id");
    expect(cartInsert).toContain("candidate.is_active");
    expect(cartInsert).toContain("candidate.is_published");
    expect(cartInsert).toContain("row_number() over");
    expect(cartInsert).toContain("(candidate.company_id = target_company_id) desc nulls last");
    expect(cartInsert).not.toContain("row.source_unit_price");
    expect(cartInsert).not.toContain("row.source_currency_code");
    expect(cartInsert).not.toMatch(/campaign|promo/);
  });

  it("preserves the existing non-cart insertion contract and least privilege", () => {
    expect(sql).toContain("coalesce(row.source_reference_id, target_source_reference_id)");
    expect(sql).toContain("row.source_unit_price");
    expect(sql).toContain("upper(nullif(btrim(row.source_currency_code), ''))");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("revoke all on function public.create_purchasing_list");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toMatch(/execute\s+format|\bdynamic\s+sql\b/);
  });

  it("contains only the bounded function replacement and privilege contract", () => {
    expect(sql).not.toMatch(/create\s+table|alter\s+table|drop\s+table|truncate|update\s+public\.|delete\s+from/);
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
  });
});
