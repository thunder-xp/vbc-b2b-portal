import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260803150000_dashboard_notifications_stabilization.sql",
), "utf8");

describe("dashboard and notification stabilization migration", () => {
  it("keeps the legacy mark-all RPC and adds a typed atomic v2 contract", () => {
    expect(sql).toContain("mark_all_partner_notifications_read_v2");
    expect(sql).toContain("'affectedCount',affected");
    expect(sql).toContain("'unreadCount',unread");
    expect(sql).toContain("'correlationId',correlation");
    expect(sql).toContain("notification.occurred_at<=cutoff");
  });

  it("keeps existing document detail notifications mutable", () => {
    expect(sql).toContain("^/cabinet/documents/[0-9a-f-]{36}$");
  });

  it("isolates recipient, company, membership and archived records", () => {
    expect(sql).toContain("has_active_notification_membership(p_company_id,auth.uid())");
    expect(sql).toContain("notification.recipient_user_id=auth.uid()");
    expect(sql).toContain("notification.company_id=p_company_id");
    expect(sql).toContain("notification.archived_at is null");
  });

  it("archives instead of deleting production notification history", () => {
    expect(sql).toContain("historical_document_backfill");
    expect(sql).toContain("duplicate_business_state");
    expect(sql).not.toMatch(/delete\s+from\s+public\.partner_notifications/i);
    expect(sql).toContain("append-only");
  });

  it("suppresses historical document backfills and stabilizes overdue identity", () => {
    expect(sql).toContain("suppress_historical_document_notifications");
    expect(sql).toContain("document.issue_date<current_date-7");
    expect(sql).toContain("candidate.planned_date+1");
    expect(sql).not.toContain("then concat(candidate.planned_date::text,':',p_business_date::text)\n+      else concat(candidate.planned_date::text,':',p_business_date::text)");
  });

  it("uses bounded indexed summary and keyset page projections", () => {
    expect(sql).toContain("partner_notifications_active_unread_v2_idx");
    expect(sql).toContain("limit normalized_limit");
    expect(sql).toContain("(notification.occurred_at,notification.id)<(p_cursor_occurred_at,p_cursor_id)");
    expect(sql).not.toContain("row_number() over (\n      order by value.occurred_at");
  });

  it("does not grant maintenance or trigger helpers to partner sessions", () => {
    expect(sql).toContain("revoke all on function public.archive_partner_notification_noise(uuid)");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke all on function public.suppress_historical_document_notification()");
  });
});
