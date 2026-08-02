import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260802220000_fix_partner_service_permission_scope.sql",
  "utf8",
);

describe("partner service navigation permission repair", () => {
  it("moves only partner service permissions into the canonical partner scope", () => {
    expect(migration).toContain("where code in ('service.view', 'service.create')");
    expect(migration).toContain("set scope = 'partner'");
    expect(migration).toContain("category = 'service'");
    expect(migration).not.toContain("admin.service.view");
    expect(migration).not.toContain("admin.service.manage");
  });
});
