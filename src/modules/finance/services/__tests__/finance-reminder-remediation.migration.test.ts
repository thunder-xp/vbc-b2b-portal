import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260907051025_finance_reminder_go_live_remediation.sql",
  "utf8",
);
const receiptGrantSql = readFileSync(
  "supabase/migrations/20260907060500_finance_reminder_delivery_receipt_grants.sql",
  "utf8",
);

describe("finance reminder go-live remediation migration", () => {
  it("separates per-run review identity from append-only LIVE delivery receipts", () => {
    expect(sql).toContain("drop constraint if exists partner_finance_reminder_projections_fingerprint_key");
    expect(sql).toContain("on public.partner_finance_reminder_projections(run_id, fingerprint)");
    expect(sql).toContain("create table public.partner_finance_reminder_delivery_receipts");
    expect(sql).toContain("delivery_identity text not null unique");
    expect(sql).toContain("DRY_RUN never writes this table");
    expect(sql).not.toMatch(/delete from public\.partner_finance_reminder_(runs|projections|suppressions)/i);
  });

  it("persists locale and channel-specific review payload fields", () => {
    expect(sql).toContain("profile.preferred_locale");
    expect(sql).toContain("'locale', coalesce(recipient.preferred_locale, 'ru')");
    expect(sql).toContain("timing_states");
    expect(sql).toContain("content_payload");
    expect(sql).toContain("cta_target = '/cabinet/finance'");
    expect(sql).toContain("from_name");
    expect(sql).toContain("from_email");
  });

  it("keeps every new data path service-only and RLS protected", () => {
    expect(sql).toContain("alter table public.partner_finance_reminder_delivery_receipts enable row level security");
    expect(sql).toContain("revoke all on table public.partner_finance_reminder_delivery_receipts from public, anon, authenticated");
    expect(sql).toContain("grant select, insert on table public.partner_finance_reminder_delivery_receipts to service_role");
    expect(sql).toContain("grant execute on function public.get_finance_reminder_delivered_identities(text[]) to service_role");
    expect(sql).toContain("coalesce(cardinality(p_delivery_identities), 0) > 2000");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toMatch(/grant .*partner_finance_reminder_delivery_receipts.*authenticated/i);
    expect(sql).not.toMatch(/smtp|send_mail|send_email/i);
    expect(receiptGrantSql).toContain(
      "revoke all on table public.partner_finance_reminder_delivery_receipts from service_role",
    );
    expect(receiptGrantSql).toContain(
      "grant select, insert on table public.partner_finance_reminder_delivery_receipts to service_role",
    );
  });

  it("counts only duplicate rows inside the same review input", () => {
    expect(sql).toContain("group by source.fingerprint");
    expect(sql).toContain("having count(*) > 1");
    expect(sql).not.toContain("where projection.fingerprint = source.fingerprint");
  });
});
