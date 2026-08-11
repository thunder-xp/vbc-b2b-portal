import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811220000_partner_employee_acceptance_artifact_cleanup.sql",
  ),
  "utf8",
);

describe("employee access acceptance artifact cleanup", () => {
  it("classifies only the verified iSecurity acceptance fixtures", () => {
    expect(migration).toContain("8a6c8a9f-1dd4-46f6-b7fc-0436fe99a0cd");
    expect(migration).toContain("DNS Authentication Acceptance");
    expect(migration).toContain("SMTP Acceptance");
    expect(migration).toContain("Acceptance Employee");
    expect(migration).toContain("Vasili Culacov");
    expect(migration).not.toContain("ginu@isecurity.md");
  });

  it("preserves source and audit rows while filtering the partner projection", () => {
    expect(migration).toContain("acceptance_artifact_at is null");
    expect(migration).toContain("membership.status = 'revoked'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(invitations|company_memberships|company_user_events)/i);
    expect(migration).not.toMatch(/update\s+public\.company_user_events/i);
  });

  it("keeps the canonical projection security boundary", () => {
    expect(migration).toContain("public.can_manage_company_users(p_company_id)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("set row_security = off");
  });
});
