import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730131000_partner_notification_event_projection.sql",
  ),
  "utf8",
);

describe("partner notification event projection", () => {
  it("uses one idempotent generation service", () => {
    expect(sql).toContain("function public.create_partner_notification_event");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
    expect(sql).toContain(
      "on conflict (recipient_user_id, deduplication_key) do nothing",
    );
  });

  it("creates a minimal append-only portal order source", () => {
    expect(sql).toContain("create table if not exists public.partner_order_notification_events");
    expect(sql).toContain("after insert or update of status, integration_status");
    expect(sql).toContain("'order_reconciliation_required'");
  });

  it("consumes existing order history and date-change events", () => {
    expect(sql).toContain("after insert on public.partner_order_history_events");
    expect(sql).toContain("when 'date_change_approved' then 'date_change_approved'");
    expect(sql).toContain("when 'delivery_date_changed' then 'shipment_date_changed'");
  });

  it("consumes governed company access events", () => {
    expect(sql).toContain("after insert on public.company_user_events");
    expect(sql).toContain("when 'invitation_accepted' then 'invitation_accepted'");
    expect(sql).toContain("when 'employee_suspended' then 'employee_suspended'");
  });

  it("deduplicates owner and creator recipients", () => {
    expect(sql).toContain("select distinct recipient.user_id");
    expect(sql).toContain("on conflict (recipient_user_id, deduplication_key) do nothing");
  });

  it("does not emit an unproven shipped event", () => {
    expect(sql).not.toContain("'order_shipped'");
  });
});
