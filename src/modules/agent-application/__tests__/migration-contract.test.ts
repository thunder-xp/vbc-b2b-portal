import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260920093952_commercial_agent_applications_public_onboarding_v2.sql"), "utf8");
const accessSql = readFileSync(resolve("supabase/migrations/20260919193027_unified_auth_access_context_foundation_v1.sql"), "utf8");

describe("Commercial Agent application migration", () => {
  it("keeps application identity distinct with a bounded lifecycle and append-only events", () => {
    expect(sql).toContain("create table public.commercial_agent_applications");
    expect(sql).toContain("create table public.commercial_agent_application_events");
    expect(sql).toContain("'DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'WITHDRAWN'");
    expect(sql).toContain("Commercial Agent application events are append-only.");
    expect(sql).not.toMatch(/commission_amount|commission_level|payout/i);
  });

  it("prevents open duplicates and provisions through the existing Agent creation boundary", () => {
    expect(sql).toContain("commercial_agent_applications_open_user_idx");
    expect(sql).toContain("for update");
    expect(sql).toContain("public.create_commercial_agent_record(");
    expect(sql).toContain("applicant_visible_note = null");
    expect(sql).toContain("reviewed_at = null");
    expect(sql).toContain("if p_action = 'APPROVE' and current_application.status = 'APPROVED'");
    expect(sql).toContain("'AGENT_PROVISIONED'");
    expect(sql).toContain("profile.user_type in ('external', 'partner')");
    expect(sql).toContain("from auth.users identity");
    expect(sql).toContain("status in ('registered', 'pending_approval')");
  });

  it("allows own reads but denies direct applicant writes and self-approval", () => {
    expect(sql).toContain("alter table public.commercial_agent_applications force row level security");
    expect(sql).toContain("using ((select auth.uid()) = applicant_user_id)");
    expect(sql).toContain("Applicants cannot review their own application.");
    expect(sql).toContain("revoke all on table public.commercial_agent_applications from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select on table public.commercial_agent_applications to authenticated");
    expect(sql).not.toMatch(/grant (?:insert|update|delete).*commercial_agent_applications to authenticated/i);
    expect(sql).toContain("grant execute on function public.review_commercial_agent_application(uuid, uuid, text, text) to service_role");
    expect(sql).not.toMatch(/grant execute on function public.review_commercial_agent_application[^;]+to authenticated/i);
  });

  it("keeps Agent cabinet availability limited to ACTIVE operational agents", () => {
    expect(accessSql).toContain("when agent.status = 'ACTIVE' then 'AVAILABLE'");
    expect(accessSql).toContain("agent.status in ('APPLIED', 'COMPLIANCE_REVIEW', 'CONTRACT_PENDING', 'APPROVED', 'TRAINING') then 'PENDING'");
    expect(sql).not.toContain("user_company_context_preferences");
  });
});
