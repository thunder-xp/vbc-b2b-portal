import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801180000_onboarding_1c_recovery_flow.sql"),
  "utf8",
);
const recoveryRepair = readFileSync(
  resolve("supabase/migrations/20260801213000_onboarding_waiting_resume_conflict_repair.sql"),
  "utf8",
);
const actions = readFileSync(
  resolve("src/modules/onboarding/actions/onboarding.actions.ts"),
  "utf8",
);
const wizard = readFileSync(
  resolve("src/modules/onboarding/components/OnboardingApprovalWizard.tsx"),
  "utf8",
);
const syncService = readFileSync(
  resolve("src/modules/onboarding/services/counterparty-directory-sync.service.ts"),
  "utf8",
);

describe("onboarding 1C counterparty recovery", () => {
  it("uses the canonical waiting state and preserves the approval draft", () => {
    expect(migration).toContain("onboarding_status = 'awaiting_1c_company'");
    expect(migration).not.toMatch(/delete from public\.onboarding_approval_drafts/i);
    expect(migration).not.toMatch(/insert into public\.(partner_companies|company_memberships)/i);
  });

  it("requires governed internal permissions for refresh and waiting actions", () => {
    expect(actions).toContain('requireAdminPermission("admin.integrations.manage")');
    expect(actions).toContain('requireAdminPermission("onboarding.requests.review")');
    expect(migration).toContain("public.has_internal_permission('admin.integrations.manage')");
    expect(migration).toContain("public.has_internal_permission('onboarding.requests.review')");
  });

  it("records the complete recovery audit vocabulary", () => {
    for (const event of [
      "directory_refresh_requested",
      "directory_refresh_succeeded",
      "directory_refresh_failed",
      "no_1c_counterparty_declared",
      "application_moved_to_1c_waiting",
      "counterparty_candidate_found",
    ]) expect(migration).toContain(`'${event}'`);
  });

  it("resumes only one active exact-IDNO match after a published sync", () => {
    expect(migration).toContain("candidate.normalized_fiscal_code = lower(regexp_replace");
    expect(migration).toContain("candidate.is_published");
    expect(migration).toContain("candidate.is_active");
    expect(migration).toContain("and 1 = (");
    expect(migration).toContain("onboarding_status = 'under_review'");
    expect(migration).toContain("onboarding_match_available");
    expect(syncService).toContain("resume_waiting_onboarding_requests_after_directory_sync");
  });

  it("uses canonical fiscal identity and the actual outbox uniqueness constraint", () => {
    expect(recoveryRepair).toContain(
      "public.normalize_moldova_fiscal_code(revision.requested_fiscal_code)",
    );
    expect(recoveryRepair).toContain("on conflict (deduplication_key) do nothing");
    expect(recoveryRepair).not.toContain(
      "on conflict (recipient_user_id, deduplication_key)",
    );
  });

  it("deduplicates concurrent refreshes and returns a correlation id", () => {
    expect(syncService).toContain("CounterpartyDirectorySyncInProgressError");
    expect(actions).toContain("deduplicated: true");
    expect(actions).toContain("correlationId");
  });

  it("keeps browser code render-only and exposes both primary recovery actions", () => {
    expect(wizard).toContain("Обновить справочник 1С");
    expect(wizard).toContain("Отметить: контрагент отсутствует в 1С");
    expect(wizard).not.toMatch(/fetch\(|supabase|createClient|getOneCEnv/);
  });

  it("keeps exact IDNO mandatory instead of using weaker identity signals", () => {
    expect(wizard).toContain("только точное совпадение по IDNO");
    expect(wizard).toContain("exactCandidateIds");
    expect(migration).not.toMatch(/normalized_(name|email|phone).*candidate/i);
  });
});
