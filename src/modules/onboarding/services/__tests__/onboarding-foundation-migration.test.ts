import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260731120000_partner_onboarding_console_foundation.sql"),
  "utf8",
);
const queuePage = readFileSync(
  resolve("app/(admin)/admin/onboarding/page.tsx"),
  "utf8",
);
const detailPage = readFileSync(
  resolve("app/(admin)/admin/onboarding/[requestId]/page.tsx"),
  "utf8",
);

describe("partner onboarding console foundation", () => {
  it("publishes a versioned local directory atomically and preserves prior snapshots on failure", () => {
    expect(migration).toContain("create table if not exists public.one_c_counterparties");
    expect(migration).toContain("create or replace function public.publish_one_c_counterparty_directory");
    expect(migration).toContain("update public.one_c_counterparties set is_published = false");
    expect(migration).toContain("where sync_id = p_sync_id");
    expect(migration).not.toMatch(/delete from public\.one_c_counterparties/i);
  });

  it("adds all matching indexes and keeps external tables private", () => {
    for (const fragment of [
      "one_c_counterparties_fiscal_idx",
      "one_c_counterparties_name_idx",
      "one_c_counterparties_phone_idx",
      "one_c_counterparties_email_idx",
      "one_c_counterparties_active_idx",
      "one_c_counterparties_portal_company_idx",
      "one_c_counterparties_synchronized_idx",
    ]) expect(migration).toContain(fragment);
    expect(migration).toContain(
      "revoke all on table public.one_c_counterparties from anon, authenticated",
    );
  });

  it("keeps the primary internal role and adds governed capabilities", () => {
    expect(migration).toContain("public.internal_user_capability_assignments");
    expect(migration).toContain("union");
    expect(migration).toContain("permission.code like 'onboarding.%'");
    expect(migration).toContain("Self-grant is not allowed.");
    expect(migration).not.toContain("partner_onboarding_manager");
    expect(migration).not.toMatch(
      /insert into public\.internal_user_role_assignments[\s\S]*onboarding/i,
    );
  });

  it("implements governed statuses, immutable revisions, and append-only events", () => {
    for (const status of [
      "received",
      "under_review",
      "clarification_requested",
      "awaiting_1c_company",
      "link_confirmation_required",
      "ready_for_approval",
      "approved",
      "rejected",
      "cancelled",
    ]) expect(migration).toContain(`'${status}'`);
    expect(migration).toContain("public.onboarding_application_revisions");
    expect(migration).toContain("public.onboarding_events");
    expect(migration).toContain("'application_migrated'");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all).*onboarding_events.*authenticated/i,
    );
  });

  it("validates transitions and preserves ready state for later approval failures", () => {
    expect(migration).toContain("public.onboarding_transition_allowed");
    expect(migration).toContain("Invalid onboarding status transition.");
    expect(migration).toContain("'approval_failed'");
    expect(migration).toContain("Confirmed company match and initial access profile are required.");
  });

  it("uses one bounded queue aggregate with no per-row profile or match action", () => {
    expect(migration).toContain("create or replace function public.get_onboarding_queue");
    expect(migration).toContain("least(greatest(coalesce(p_page_size, 25), 1), 50)");
    expect(migration).toContain("join public.onboarding_application_revisions");
    expect(queuePage).toContain("listOnboardingQueueAction(filters)");
    expect(queuePage).not.toContain("searchPartners");
    expect(detailPage).not.toContain("searchPartners");
  });

  it("centralizes Chisinau working-time SLA and clarification pause state", () => {
    expect(migration).toContain("public.onboarding_add_working_hours");
    expect(migration).toContain("Europe/Chisinau");
    expect(migration).toContain("time '09:00'");
    expect(migration).toContain("time '18:00'");
    expect(migration).toContain("clarification_paused_seconds");
  });

  it("requires local manager confirmation and blocks ambiguous automatic linking", () => {
    expect(migration).toContain("public.confirm_onboarding_counterparty_match");
    expect(migration).toContain("Counterparty is already linked to another portal company.");
    expect(migration).toContain("when fiscal_match_count > 1 then 'multiple_candidates'");
    expect(migration).not.toContain("requested_external_1c_id = candidate.external_1c_id");
  });

  it("supports governed reassignment without storing assignee identifiers in event metadata", () => {
    expect(migration).toContain("'managers', coalesce((");
    expect(migration).toContain("Assignee is not an active onboarding manager.");
    expect(migration).toContain("jsonb_build_object('assignment', 'changed')");
    expect(migration).not.toContain(
      "jsonb_build_object('assignee_user_id', p_assignee_user_id)",
    );
  });
});
