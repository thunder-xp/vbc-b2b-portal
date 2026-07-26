import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726163000_admin_effective_access_inspector.sql",
  ),
  "utf8",
);

describe("admin effective access inspector migration", () => {
  it("requires the security-view permission for both bounded reads", () => {
    expect(
      sql.match(/public\.has_internal_permission\('admin\.security\.view'\)/g),
    ).toHaveLength(2);
    expect(sql).toContain("limit normalized_limit");
    expect(sql).toContain("limit 500");
  });

  it("requires a real partner membership in the requested company", () => {
    expect(sql).toContain("membership.user_id = target_profile.id");
    expect(sql).toContain("membership.company_id = p_company_id");
    expect(sql).toContain(
      "The user has no membership in the requested company.",
    );
  });

  it("explains deny-wins resolution and inactive gates", () => {
    for (const source of [
      "membership_deny",
      "membership_allow",
      "role_grant",
      "internal_role",
      "inactive_profile",
      "inactive_company",
      "inactive_membership",
      "no_role_assignment",
    ]) {
      expect(sql).toContain(`'${source}'`);
    }
    expect(sql).toContain(
      "permission_override.effect is distinct from 'deny'",
    );
  });

  it("is read-only and does not implement impersonation", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|public\.)/i);
    expect(sql).not.toMatch(/auth\.admin|service_role|sign_in_as|create_session/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
});
