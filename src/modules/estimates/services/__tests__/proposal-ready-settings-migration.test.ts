import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260930203418_fix_ready_estimate_proposal_settings.sql"),
  "utf8",
).toLowerCase();
const runtime = readFileSync(
  join(process.cwd(), "supabase/tests/ready_estimate_proposal_settings_runtime.sql"),
  "utf8",
).toLowerCase();

describe("ready estimate proposal settings migration", () => {
  it("allows only draft and ready estimates while preserving the guarded write contract", () => {
    expect(migration).toContain("target.status not in ('draft', 'ready')");
    expect(migration).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(migration).toContain("where id = target_estimate_id\n  for update");
    expect(migration).toContain("target.revision <> expected_revision");
    expect(migration).toContain("errcode = 'pt409'");
    expect(migration).toContain("jsonb_typeof(settings_payload) <> 'object'");
    expect(migration).toContain("octet_length(settings_payload::text) > 20000");
    expect(migration).toContain("from public.proposal_templates template");
    expect(migration).toContain("revision = revision + 1");
  });

  it("pins the definer search path and exposes execution only to governed server roles", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("from public.estimates");
    expect(migration).toContain("revoke all on function public.save_estimate_proposal_settings");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/);
  });

  it("ships transactional runtime coverage for state, concurrency, authorization and immutable versions", () => {
    for (const evidence of [
      "draft estimate settings did not persist",
      "ready estimate settings did not persist",
      "sent estimate settings mutation was accepted",
      "stale ready revision was accepted",
      "user without estimates.manage mutated proposal settings",
      "ten independent false display flags were not stored",
      "historical proposal version changed after live settings save",
      "future/live settings did not remain separate from historical version",
    ]) expect(runtime).toContain(evidence);
    expect(runtime).toContain("exception when sqlstate 'pt409'");
    expect(runtime).toContain("rollback;");
  });
});
