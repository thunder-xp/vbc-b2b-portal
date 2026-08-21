import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260802190000_commercial_integrity_diagnostics.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const failedStateSql = readFileSync(
  resolve("supabase/migrations/20260802191000_stock_publication_diagnostic_failed_state.sql"),
  "utf8",
);
const triggerRepairSql = readFileSync(
  resolve("supabase/migrations/20260802192000_commercial_opportunity_product_trigger_repair.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const adminDiagnosticSql = readFileSync(
  resolve("supabase/migrations/20260802193000_commercial_integrity_admin_diagnostic.sql"),
  "utf8",
);

describe("commercial integrity diagnostics migration", () => {
  it("resolves company identity without reading company_id from item rows", () => {
    expect(sql).toContain("elsif tg_table_name = 'partner_order_history_items'");
    expect(sql).toContain("where value.id = coalesce(new.order_history_id, old.order_history_id)");
    expect(sql).not.toContain("case\n    when tg_table_name");
  });

  it("keeps stock publication diagnostics rollback-only and server-only", () => {
    expect(sql).toContain("commercial_integrity_rollback_success");
    expect(sql).toContain("get stacked diagnostics");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("revoke all on function public.diagnose_stock_publication_failure(uuid)");
    expect(sql).toContain("grant execute on function public.diagnose_stock_publication_failure(uuid)\nto service_role");
    expect(failedStateSql).toContain("set active_sync_id = p_sync_id, status = 'running'");
    expect(failedStateSql).toContain("commercial_integrity_rollback_success");
  });

  it("evaluates price-only fields only for the product_prices trigger", () => {
    expect(triggerRepairSql).toContain("if tg_table_name = 'product_prices' then");
    expect(triggerRepairSql).toContain("old.external_1c_price_type_id");
    expect(triggerRepairSql).toContain("else\n    product := coalesce(new.product_id, old.product_id)");
  });

  it("classifies missing commercial projections without manufacturing zero values", () => {
    expect(adminDiagnosticSql).toContain("'missing_partner_price'");
    expect(adminDiagnosticSql).toContain("'missing_stock'");
    expect(adminDiagnosticSql).toContain("'company_price_profile_missing'");
    expect(adminDiagnosticSql).not.toMatch(/coalesce\(stock\.available_quantity,\s*0\)/);
    expect(adminDiagnosticSql).not.toMatch(/coalesce\(price\.price_amount,\s*0\)/);
  });

  it("distinguishes deleted source documents from missing local lines", () => {
    expect(adminDiagnosticSql).toContain("when history.one_c_deletion_mark then 'source_document_deleted'");
    expect(adminDiagnosticSql).toContain("when counts.local_line_count = 0 then 'zero_local_lines'");
    expect(adminDiagnosticSql).toContain("history.position_count <> counts.local_line_count");
  });

  it("keeps diagnostics bounded, read-only, permission-gated, and local", () => {
    expect(adminDiagnosticSql).toContain("limit 100");
    expect(adminDiagnosticSql).toContain("security definer");
    expect(adminDiagnosticSql).toContain("set search_path = public");
    expect(adminDiagnosticSql).toContain("has_internal_permission('admin.stock.view')");
    expect(adminDiagnosticSql).not.toMatch(/insert into|update public|delete from public/i);
    expect(adminDiagnosticSql).not.toContain("http_");
  });
});
