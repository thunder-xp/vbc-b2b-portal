import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260906130000_partner_payment_obligation_v1.sql", "utf8");
const signedBalanceAmendment = readFileSync(
  "supabase/migrations/20260906132500_allow_unsupported_negative_finance_balance.sql",
  "utf8",
);

describe("partner payment obligation migration contract", () => {
  it("creates a company-scoped current projection with one-order identity and atomic replacement", () => {
    expect(sql).toContain("create table public.partner_payment_obligations");
    expect(sql).toContain("unique(company_id, one_c_order_id)");
    expect(sql).toContain("schedule_line_number bigint not null");
    expect(sql).toContain("source_order_data_version text null");
    expect(sql).toContain("create or replace function public.publish_partner_finance_snapshot_v3");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("delete from public.partner_payment_obligations obligation");
    expect(sql).toContain("delete from public.partner_payment_obligation_exclusions exclusion");
  });

  it("keeps partner reads permission-gated, READY-only and company-scoped", () => {
    expect(sql).toContain("alter table public.partner_payment_obligations enable row level security");
    expect(sql).toContain("reconciliation_status = 'READY'");
    expect(sql).toContain("public.has_permission(company_id, 'finance.view_company')");
    expect(sql).toContain("public.has_permission(p_company_id, 'finance.view_company')");
    expect(sql).toContain("where obligation.company_id = p_company_id");
    expect(sql).toContain("revoke all on public.partner_payment_obligations, public.partner_payment_obligation_exclusions");
    expect(sql).not.toContain("grant select on public.partner_payment_obligation_exclusions to authenticated");
  });

  it("keeps sync and reminder operations service-role-only with DRY_RUN hard constraints", () => {
    expect(sql.match(/auth\.role\(\) <> 'service_role'/g)).toHaveLength(3);
    expect(sql).toContain("grant execute on function public.publish_partner_finance_snapshot_v3");
    expect(sql).toContain("grant execute on function public.get_finance_reminder_dry_run_input() to service_role");
    expect(sql).toContain("check (outbound_mode = 'DRY_RUN')");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
    expect(sql).toContain("'DUPLICATE'");
    expect(sql).not.toMatch(/smtp|send_mail|send_email/i);
  });

  it("keeps READY balances nonnegative while retaining signed fail-closed source evidence", () => {
    expect(signedBalanceAmendment).toContain("remaining_amount >= 0");
    expect(signedBalanceAmendment).toContain(
      "reconciliation_status in ('UNSUPPORTED', 'NON_RECONCILING')",
    );
    expect(signedBalanceAmendment).not.toContain("reconciliation_status = 'READY'");
  });

  it("gates the internal operational view and allows only the finance deep link", () => {
    expect(sql).toContain("public.has_internal_permission('admin.finance.view')");
    expect(sql).toContain("'/cabinet/finance'");
    expect(sql).toContain("finance_payment_due");
  });
});
