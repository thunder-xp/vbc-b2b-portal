import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261001120000_fix_archived_draft_proposal_settings.sql"),
  "utf8",
).toLowerCase();
const runtime = readFileSync(
  join(process.cwd(), "supabase/tests/archived_draft_proposal_settings_runtime.sql"),
  "utf8",
).toLowerCase();

describe("archived draft proposal settings migration", () => {
  it("extends only the presentation write state predicate", () => {
    expect(migration).toContain("target.status in ('draft', 'ready')");
    expect(migration).toContain("target.status = 'archived' and target.lifecycle_status = 'draft'");
    expect(migration).toContain("public.can_access_estimates(target.company_id, 'estimates.manage')");
    expect(migration).toContain("where id = target_estimate_id\n  for update");
    expect(migration).toContain("target.revision <> expected_revision");
    expect(migration).toContain("errcode = 'pt409'");
    expect(migration).toContain("jsonb_typeof(settings_payload) <> 'object'");
    expect(migration).toContain("octet_length(settings_payload::text) > 20000");
    expect(migration).toContain("from public.proposal_templates template");
    expect(migration).toContain("proposal_settings = settings_payload");
    expect(migration).toContain("revision = revision + 1");
    expect(migration).not.toMatch(/update public\.estimate_items/);
    expect(migration).not.toMatch(/update public\.estimate_sections/);
  });

  it("preserves the hardened definer and grants contract", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("from public.estimates");
    expect(migration).toContain("revoke all on function public.save_estimate_proposal_settings");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/);
  });

  it("ships transactional state, commercial immutability and version-snapshot coverage", () => {
    for (const evidence of [
      "draft estimate settings did not persist",
      "ready estimate settings did not persist",
      "archived draft settings did not persist",
      "archived sent settings mutation was accepted",
      "archived accepted settings mutation was accepted",
      "archived rejected settings mutation was accepted",
      "archived expired settings mutation was accepted",
      "active sent settings mutation was accepted",
      "archived commercial line mutation was accepted",
      "historical proposal version changed after archived settings save",
      "stale archived draft revision was accepted",
    ]) expect(runtime).toContain(evidence);
    expect(runtime).toContain("exception when sqlstate 'pt409'");
    expect(runtime).toContain("rollback;");
  });
});
