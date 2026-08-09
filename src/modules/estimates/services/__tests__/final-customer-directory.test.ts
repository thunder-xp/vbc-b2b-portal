import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260809006000_partner_final_customer_directory.sql"), "utf8");
const editor = readFileSync(join(process.cwd(), "src/modules/estimates/components/EstimateCommercialEditor.tsx"), "utf8");
const picker = readFileSync(join(process.cwd(), "src/modules/estimates/components/FinalCustomerPicker.tsx"), "utf8");
const listPage = readFileSync(join(process.cwd(), "app/(partner)/cabinet/customers/page.tsx"), "utf8");
const detailPage = readFileSync(join(process.cwd(), "app/(partner)/cabinet/customers/[customerId]/page.tsx"), "utf8");

describe("final customer directory migration", () => {
  it("adds a governed taxonomy without removing legacy history", () => {
    expect(migration).toContain("add column industry_code text null");
    expect(migration).toContain("partner_final_customers_industry_code_check");
    expect(migration).not.toContain("drop column industry");
  });

  it("uses one bounded company-scoped aggregate and the existing estimate index", () => {
    expect(migration).toContain("create or replace function public.list_partner_final_customers");
    expect(migration).toContain("public.can_access_estimates(target_company_id, 'estimates.view')");
    expect(migration).toContain("limit bounded_limit offset bounded_offset");
    expect(migration).toContain("estimate.final_customer_id in (select eligible.id from eligible)");
    expect(migration).not.toMatch(/http|onec|1c_/i);
  });

  it("makes picker search reuse the canonical list projection", () => {
    expect(migration).toContain("from public.list_partner_final_customers(");
    expect(migration).toContain("least(greatest(coalesce(result_limit, 8), 1), 12)");
  });

  it("guards cross-company detail and detects obvious duplicates", () => {
    expect(migration).toContain("company_id = target_company_id and archived_at is null");
    expect(migration).toContain("lower(btrim(existing.display_name)) = lower(btrim(target_display_name))");
    expect(migration).toContain("upper(existing.fiscal_code) = upper(btrim(target_fiscal_code))");
  });

  it("keeps all writes behind versioned RPCs and explicit grants", () => {
    expect(migration).toContain("create_partner_final_customer_v2");
    expect(migration).toContain("update_partner_final_customer_v2");
    expect(migration).toContain("security definer\nset search_path = public");
    expect(migration).toContain("revoke all on function public.list_partner_final_customers");
  });
});

describe("final customer directory UI", () => {
  it("renders the requested bounded fields and related estimates", () => {
    for (const label of ["Заказчик", "Город / регион", "Отрасль", "Сметы", "Последняя смета", "Последний проект / объект"]) expect(listPage).toContain(label);
    expect(detailPage).toContain("Связанные сметы");
    expect(detailPage).not.toMatch(/сделк|лид|воронк|звонк|напомин/i);
  });

  it("uses structured industry controls in both editor surfaces", () => {
    expect(picker).toContain("FINAL_CUSTOMER_INDUSTRIES.map");
    expect(picker).not.toContain('name="newCustomerIndustry"');
    expect(detailPage).toContain("FinalCustomerEditForm");
  });

  it("constrains the settings band and picker at mobile widths", () => {
    expect(editor).toContain("grid min-w-0 gap-3 border-t");
    expect(editor).toContain("min-w-0 max-w-full sm:col-span-2");
    expect(editor).toContain("grid grid-cols-2 items-start gap-2 sm:grid-cols-4 xl:grid-cols-[1.5rem_1.5rem_minmax(12rem,1fr)");
    expect(picker).toContain("min-w-0 max-w-full space-y-2");
  });
});
