import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260812233000_estimate_version_conflict_idempotency.sql"), "utf8");
const repository = readFileSync(join(process.cwd(), "src/modules/estimates/repositories/supabase/lifecycle.supabase-repository.ts"), "utf8");
const component = readFileSync(join(process.cwd(), "src/modules/estimates/components/EstimateProposalSidebar.tsx"), "utf8");

describe("estimate version conflict stabilization", () => {
  it("returns stale revisions as a committed domain result rather than 40001", () => {
    expect(sql).toContain("'code', 'ESTIMATE_VERSION_CONFLICT'");
    expect(sql).toContain("'status', 'conflict'");
    expect(sql).not.toContain("using errcode = '40001'");
  });

  it("stores immutable idempotency outcomes and returns successful repeats", () => {
    expect(sql).toContain("create table if not exists public.estimate_version_commands");
    expect(sql).toContain("prevent_estimate_version_command_mutation");
    expect(sql).toContain("'status', 'created', 'version', to_jsonb(prior_version), 'repeated', true");
    expect(sql).toContain("where version.estimate_id = target.id and version.estimate_revision = target.revision");
  });

  it("keeps snapshot capture, version insert, event, and command in one locked transaction", () => {
    expect(sql).toContain("where id = target_estimate_id for update");
    expect(sql).toContain("public.capture_estimate_snapshot(target.id)");
    expect(sql).toContain("insert into public.estimate_events");
    expect(sql).toContain("insert into public.estimate_version_commands");
  });

  it("uses the v2 runtime path and never retries its structured conflict", () => {
    expect(repository).toContain('rpc("create_estimate_version_v2"');
    expect(repository).toContain('result.status === "conflict"');
    expect(component).toContain("if (submitting.current) return");
  });
});
