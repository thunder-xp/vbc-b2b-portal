import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260919193027_unified_auth_access_context_foundation_v1.sql"), "utf8");

describe("Unified business access SQL boundary", () => {
  it("permits an active external principal to hold governed Partner and Agent relationships", () => {
    expect(migration).toContain("drop trigger if exists enforce_partner_membership_distinct_from_agent");
    expect(migration).toContain("private.enforce_agent_principal_eligibility");
    expect(migration).not.toContain("Commercial Agent principal cannot receive Partner membership");
    expect(migration).not.toContain("without Partner membership");
  });

  it("reuses the existing preference with a constrained Partner/Agent target", () => {
    expect(migration).toContain("alter table public.user_company_context_preferences");
    expect(migration).toContain("active_context_type in ('PARTNER', 'AGENT')");
    expect(migration).toContain("force row level security");
    expect(migration).not.toContain("create table public.access_context");
  });

  it("resolves one bounded auth.uid-scoped projection without user_type authorization", () => {
    const body = functionBody("resolve_own_business_access_contexts");
    expect(body).toContain("auth.uid()");
    expect(body).toContain("public.company_memberships");
    expect(body).toContain("public.partner_companies");
    expect(body).toContain("public.commercial_agents");
    expect(body).not.toContain("user_type");
    expect(body).not.toContain("onec");
  });

  it("revalidates both selected context ownership and operational status", () => {
    const body = functionBody("select_own_business_context");
    expect(body).toContain("membership.user_id = profile.id");
    expect(body).toContain("profile.id = actor_id");
    expect(body).toContain("company.id = p_context_id");
    expect(body).toContain("agent.user_id = actor_id");
    expect(body).toContain("agent.status = 'active'");
    expect(body).toContain("business_context_not_available");
  });

  it("keeps RPCs unavailable to anon and explicitly grants authenticated callers", () => {
    expect(migration).toContain("revoke all on function public.resolve_own_business_access_contexts() from public, anon, authenticated, service_role");
    expect(migration).toContain("revoke all on function public.select_own_business_context(text, uuid) from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.resolve_own_business_access_contexts() to authenticated");
    expect(migration).toContain("grant execute on function public.select_own_business_context(text, uuid) to authenticated");
  });
});

function functionBody(name: string) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"));
  expect(match, `${name} function missing`).not.toBeNull();
  return match?.[0].toLowerCase() ?? "";
}
