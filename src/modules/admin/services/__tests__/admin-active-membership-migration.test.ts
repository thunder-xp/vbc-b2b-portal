import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260802152000_admin_active_membership_projections.sql"),
  "utf8",
);
const accessSubjects = fs.readFileSync(
  path.resolve("src/modules/admin/components/AdminCompanyAccessSubjects.tsx"),
  "utf8",
);
const integrityProjection = migration.slice(
  migration.indexOf("create or replace function public.get_admin_partner_user_integrity"),
);

describe("active admin membership projections", () => {
  it("aggregates current company names, roles, owner state, and price access from active rows only", () => {
    expect(migration).toContain("active_memberships as (");
    expect(migration).toMatch(/from membership_rows row\s+where row\.status = 'active'/);
    expect(migration).toContain("coalesce(active_membership.companies");
    expect(migration).toContain("else active_membership.roles");
  });

  it("searches only active company memberships", () => {
    expect(migration).toContain("from unnest(identity.company_names) company_name");
    expect(migration).toMatch(/where membership\.user_id = profile\.id and membership\.status = 'active'\s+and company\.display_name ilike/);
  });

  it("keeps suspended filtering without projecting a suspended company as current", () => {
    expect(migration).toContain("bool_or(row.status = 'suspended') as has_suspended_membership");
    expect(migration).toContain("normalized_filter = 'suspended' and identity.has_suspended_membership");
  });

  it("returns only active contexts to the effective-access selector", () => {
    expect(migration).toMatch(/where membership\.user_id = profile\.id and membership\.status = 'active'/);
    expect(accessSubjects).toContain('record.membershipStatus === "active"');
  });

  it("preserves all membership rows in integrity history with lifecycle and audit metadata", () => {
    expect(integrityProjection).toContain("'approvedAt', membership.approved_at");
    expect(integrityProjection).toContain("'endedAt'");
    expect(integrityProjection).toContain("'historyReason', membership_event.reason");
    expect(integrityProjection).toContain("'relatedAuditEvent'");
    expect(integrityProjection).not.toMatch(/where membership\.user_id = profile\.id\s+and membership\.status = 'active'/);
  });

  it("does not mutate or delete membership history", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.company_memberships/i);
    expect(migration).not.toMatch(/update\s+public\.company_memberships/i);
  });
});
