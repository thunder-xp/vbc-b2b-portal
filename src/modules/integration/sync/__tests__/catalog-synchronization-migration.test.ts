import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260823143000_unified_catalog_projection_orchestration.sql", "utf8");

describe("unified catalog synchronization migration", () => {
  it("keeps the run ledger and append-only events server-only", () => {
    expect(migration).toMatch(/alter table public\.catalog_synchronization_runs enable row level security/i);
    expect(migration).toMatch(/alter table public\.catalog_synchronization_events enable row level security/i);
    expect(migration).toMatch(/revoke all on table[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/prevent_catalog_synchronization_event_mutation[\s\S]*before update or delete/i);
    expect(migration).toMatch(/grant execute on function[\s\S]*to service_role/i);
  });

  it("uses explicit search paths and a single projection lock", () => {
    const privilegedFunctions = migration.match(/security definer set search_path = ''/gi) ?? [];
    expect(privilegedFunctions).toHaveLength(6);
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('catalog_projection_orchestration', 0))");
    expect(migration).toMatch(/public_retail_projection_status = 'running'/i);
  });

  it("provides idempotent source identity and bounded projection recovery", () => {
    expect(migration).toMatch(/unique \(source_domain, source_sync_id\)/i);
    expect(migration).toMatch(/projection_attempt_count integer not null default 0 check \(projection_attempt_count between 0 and 3\)/i);
    expect(migration).toMatch(/projection_started_at < now\(\) - interval '30 minutes'/i);
    expect(migration).toMatch(/projection_attempt_count < 3/i);
  });

  it("records explicit source, B2B, projection, publication, and overall states", () => {
    for (const column of ["source_status", "b2b_projection_status", "public_retail_projection_status", "public_retail_publication_status", "overall_status", "changed_counts", "public_retail_checksum"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("overall_status = 'partial_success'");
  });
});
