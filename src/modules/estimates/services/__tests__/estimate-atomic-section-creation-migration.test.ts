import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260809133000_estimate_atomic_section_creation.sql"), "utf8");

describe("atomic estimate section creation migration", () => {
  it("creates one authenticated idempotent section mutation", () => {
    expect(migration).toContain("create or replace function public.add_estimate_section_v2");
    expect(migration).toContain("for update");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("target.revision <> expected_revision");
    expect(migration).toContain("request_fingerprint");
    expect(migration).toContain("event_type)");
    expect(migration).toContain("'section_created'");
  });

  it("keeps the idempotency ledger private and the RPC scoped to authenticated users", () => {
    expect(migration).toContain("alter table public.estimate_section_insertions enable row level security");
    expect(migration).toContain("revoke all on table public.estimate_section_insertions from public, anon, authenticated");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("grant execute on function public.add_estimate_section_v2");
    expect(migration).toContain("to authenticated");
  });
});
