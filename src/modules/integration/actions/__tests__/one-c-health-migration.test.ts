import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726153000_admin_diagnostic_audit.sql",
  ),
  "utf8",
);

describe("internal diagnostic audit migration", () => {
  it("keeps diagnostic audit append-only and permission checked", () => {
    expect(migration).toContain("internal_diagnostic_audit_events");
    expect(migration).toContain(
      "has_internal_permission('admin.diagnostics.run')",
    );
    expect(migration).toContain(
      "revoke all on table public.internal_diagnostic_audit_events",
    );
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)\s+on table public\.internal_diagnostic_audit_events\s+to authenticated/i,
    );
  });
});
