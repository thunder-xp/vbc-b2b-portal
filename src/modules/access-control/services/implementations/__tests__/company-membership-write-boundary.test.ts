import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726166000_company_membership_write_boundary.sql",
  ),
  "utf8",
).toLowerCase();
const repository = readFileSync(
  join(
    process.cwd(),
    "src/modules/access-control/repositories/supabase/company-membership.supabase-repository.ts",
  ),
  "utf8",
);

describe("company membership write boundary", () => {
  it("routes approval creation through one narrow RPC", () => {
    expect(repository).toContain(
      '"create_approved_company_membership"',
    );
    expect(repository).not.toMatch(
      /\.from\("company_memberships"\)[\s\S]*?\.insert\(/,
    );
  });

  it("requires the authenticated access reviewer and approved state", () => {
    expect(migration).toContain("actor_id <> p_approved_by");
    expect(migration).toContain("public.can_review_access_requests()");
    expect(migration).toContain("p_status <> 'active'");
  });

  it("is idempotent under a user-company advisory lock", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("if existing_membership.status = 'active'");
    expect(migration).toContain("return existing_membership");
  });

  it("removes authenticated direct insert access", () => {
    expect(migration).toContain(
      'drop policy if exists "internal users can insert company memberships"',
    );
    expect(migration).toContain(
      "revoke insert on table public.company_memberships from authenticated",
    );
  });
});
