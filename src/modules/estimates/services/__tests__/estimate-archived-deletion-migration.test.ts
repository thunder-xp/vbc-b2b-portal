import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260809134000_estimate_archived_deletion.sql"), "utf8");
const semantics = readFileSync(resolve("supabase/migrations/20260908202147_archived_estimate_delete_semantics.sql"), "utf8");

describe("archived estimate deletion migration", () => {
  it("uses a governed tombstone and immutable idempotent audit event", () => {
    expect(sql).toContain("deleted_at timestamptz");
    expect(sql).toContain("create table public.estimate_deletion_events");
    expect(sql).toContain("before update or delete on public.estimate_deletion_events");
    expect(sql).toContain("unique(company_id, request_key)");
    expect(sql).not.toMatch(/delete\s+from\s+public\.estimates/i);
  });

  it("requires archive, optimistic revision, company capability, and safe history", () => {
    expect(sql).toContain("target.status <> 'archived'");
    expect(sql).toContain("target.revision <> expected_revision");
    expect(sql).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(sql).toContain("target.lifecycle_order_id is not null");
    expect(sql).toContain("public.estimate_proposal_deliveries");
    expect(sql).toContain("public.estimate_cart_conversions");
  });

  it("hides tombstones from canonical partner projections and preserves RLS", () => {
    expect(sql).toContain("deleted_at is null and public.can_access_estimates(company_id, 'estimates.view')");
    expect(sql).toContain("estimate.deleted_at is null");
    expect(sql).toContain("revoke all on table public.estimate_deletion_events from public, anon, authenticated");
    expect(sql).toContain("set search_path = public");
  });
});

describe("archived estimate deletion semantics repair", () => {
  it("keeps historical preparation references but protects commercial lifecycle", () => {
    expect(semantics).not.toContain("from public.estimate_cart_conversions");
    expect(semantics).toContain("delivery.sent_at is not null");
    expect(semantics).toContain("delivery.first_opened_at is not null");
    expect(semantics).toContain("version.status <> 'prepared'");
    expect(semantics).toContain("event.to_status <> 'draft'");
    expect(semantics).toContain("target.lifecycle_order_id is not null");
    expect(semantics).toContain("target.accepted_version_id is not null");
  });

  it("uses typed protected, stale, and not-found database errors", () => {
    expect(semantics).toContain("'ESTIMATE_DELETE_BLOCKED_PROPOSAL' using errcode = '23514'");
    expect(semantics).toContain("'ESTIMATE_DELETE_BLOCKED_ORDER' using errcode = '23514'");
    expect(semantics).toContain("'ESTIMATE_DELETE_STALE_REVISION' using errcode = 'PT409'");
    expect(semantics).toContain("'ESTIMATE_DELETE_NOT_AVAILABLE' using errcode = 'P0002'");
  });

  it("only writes the estimate tombstone and appends its immutable event", () => {
    expect(semantics).toMatch(/update public\.estimates[\s\S]+set deleted_at = statement_timestamp\(\),\s+deleted_by = auth\.uid\(\),\s+deletion_reason = normalized_reason/);
    expect(semantics).toContain("insert into public.estimate_deletion_events");
    expect(semantics).not.toMatch(/delete\s+from/i);
    expect(semantics).toContain("where request_key = target_request_key and actor_user_id = auth.uid()");
  });

  it("preserves the privileged function boundary", () => {
    expect(semantics).toContain("security definer");
    expect(semantics).toContain("set search_path = public");
    expect(semantics).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(semantics).toContain("revoke all on function public.delete_archived_estimate(uuid, integer, uuid, text) from public, anon");
    expect(semantics).toContain("grant execute on function public.delete_archived_estimate(uuid, integer, uuid, text) to authenticated");
  });
});
