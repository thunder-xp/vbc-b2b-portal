import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730150000_cron_authorization_health.sql",
  ),
  "utf8",
).toLowerCase();

describe("cron authorization health", () => {
  it("persists bounded safe categories without headers or secrets", () => {
    expect(migration).toContain("create table public.cron_route_health");
    expect(migration).toContain("on conflict (route) do update");
    expect(migration).not.toContain("authorization_header");
    expect(migration).not.toContain("cron_secret");
  });

  it("keeps telemetry server-only and diagnostics admin-only", () => {
    expect(migration).toContain(
      "revoke all on table public.cron_route_health from public, anon, authenticated",
    );
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain(
      "has_internal_permission('admin.integrations.view')",
    );
  });
});
