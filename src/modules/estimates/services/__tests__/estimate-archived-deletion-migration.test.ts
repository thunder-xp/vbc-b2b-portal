import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260809134000_estimate_archived_deletion.sql"), "utf8");

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
