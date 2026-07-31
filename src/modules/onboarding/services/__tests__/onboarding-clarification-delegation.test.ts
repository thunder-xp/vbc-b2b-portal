import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const migration = read("supabase/migrations/20260731160000_onboarding_clarification_delegation.sql");
const actions = read("src/modules/onboarding/actions/onboarding.actions.ts");
const repository = read("src/modules/onboarding/repositories/supabase-onboarding.repository.ts");
const managerUi = read("src/modules/onboarding/components/OnboardingDecisionForms.tsx");
const partnerUi = read("src/modules/onboarding/components/PartnerOnboardingStatusCenter.tsx");
const correctionUi = read("src/modules/onboarding/components/OnboardingCorrectionForm.tsx");
const adminUi = read("src/modules/admin/components/AdminUserDirectory.tsx");

describe("clarification and immutable partner correction", () => {
  it("requires a governed clarification reason", () => {
    expect(migration).toContain("invalid_clarification_reason");
    expect(managerUi).toContain("reasonCategory");
  });
  it("requires a partner-facing message and correction fields", () => {
    expect(migration).toContain("partner_message_required");
    expect(migration).toContain("invalid_clarification_fields");
  });
  it("stores partner message and internal note separately", () => {
    expect(migration).toContain("clarification_partner_message");
    expect(migration).toContain("clarification_internal_note");
  });
  it("never projects the internal note to the partner status center", () => {
    const center = migration.slice(migration.indexOf("get_own_onboarding_status_center"));
    expect(center).not.toContain("clarification_internal_note");
    expect(partnerUi).not.toContain("internalNote");
  });
  it("limits partner edits to governed business fields", () => {
    expect(actions).toContain("partnerRevisionSchema");
    expect(correctionUi).not.toMatch(/name="(counterpartyId|priceProfileId|permissionCode|roleCode)"/i);
  });
  it("creates a new immutable revision instead of updating the old revision", () => {
    expect(migration).toContain("insert into public.onboarding_application_revisions");
    expect(migration).not.toMatch(/update public\.onboarding_application_revisions set/);
  });
  it("increments the revision and fingerprints submitted data", () => {
    expect(migration).toContain("current_revision.revision_number + 1");
    expect(migration).toContain("fingerprint_value := encode(digest");
  });
  it("returns partner resubmission to review and invalidates matching choices", () => {
    expect(migration).toContain("onboarding_status = 'under_review'");
    expect(migration).toContain("confirmed_counterparty_id = null");
  });
  it("rejects stale revisions", () => {
    expect(migration).toContain("stale_request_revision");
    expect(actions).toContain("expectedRevision");
  });
});

describe("rejection, cancellation, and reopen", () => {
  it("requires a governed rejection reason", () => {
    expect(migration).toContain("invalid_rejection_reason");
  });
  it("shows only the safe rejection explanation to the partner", () => {
    expect(migration).toContain("when request.onboarding_status = 'rejected' then request.rejection_partner_message");
    expect(partnerUi).toContain("center.partnerMessage");
  });
  it("makes approval drafts read-only through terminal status guards", () => {
    expect(managerUi).toContain('["approved", "rejected", "cancelled"]');
  });
  it("allows partner cancellation only for non-terminal requests", () => {
    expect(migration).toContain("onboarding_status not in ('approved', 'rejected', 'cancelled')");
  });
  it("does not delete companies or memberships during cancellation", () => {
    const cancel = migration.slice(migration.indexOf("cancel_own_onboarding_request"), migration.indexOf("cancel_onboarding_request_internal"));
    expect(cancel).not.toMatch(/delete from public\.(partner_companies|company_memberships)/);
  });
  it("restricts reopen to platform administrators", () => {
    const reopen = migration.slice(migration.indexOf("reopen_onboarding_request"), migration.indexOf("assign_onboarding_request"));
    expect(reopen).toContain("context.is_platform_admin");
  });
  it("reopens only rejected or cancelled requests", () => {
    expect(migration).toContain("request.onboarding_status not in ('rejected', 'cancelled')");
    expect(managerUi).toContain('requestStatus === "approved"');
  });
  it("requires an explicit manager when reopening", () => {
    expect(migration).toContain("is_onboarding_manager_eligible(p_assignee_user_id)");
  });
});

describe("delegation, notifications, SLA, and audit", () => {
  it("keeps capability grants additive to the primary role", () => {
    expect(adminUi).toContain("Разрешить обработку заявок партнёров");
    expect(adminUi).not.toContain("permissionCode");
  });
  it("uses the existing onboarding capability bundle", () => {
    expect(read("src/modules/admin/repositories/supabase/admin-role-management.supabase-repository.ts"))
      .toContain("grant_internal_onboarding_capability_bundle");
  });
  it("records assignment and reassignment separately", () => {
    expect(migration).toContain("event_name := case when request.assigned_manager_user_id is null then 'assigned' else 'reassigned' end");
  });
  it("deduplicates partner and manager notifications", () => {
    expect(migration).toContain("deduplication_key text not null unique");
    expect(migration).toContain("on conflict (deduplication_key) do nothing");
  });
  it("pauses SLA for clarification", () => {
    expect(migration).toContain("clarification_paused_at = now()");
    expect(migration).toContain("'sla_paused'");
  });
  it("resumes SLA after partner revision", () => {
    expect(migration).toContain("clarification_paused_at = null");
    expect(migration).toContain("'sla_resumed'");
  });
  it("keeps terminal requests out of overdue workload", () => {
    expect(migration).toContain("onboarding_status not in ('approved', 'rejected', 'cancelled')");
  });
  it("writes safe message fingerprints rather than messages into audit metadata", () => {
    expect(migration).toContain("partner_message_fingerprint");
    expect(migration).not.toContain("jsonb_build_object('partner_message'");
  });
});

describe("projection, security, and UX", () => {
  it("uses one aggregate for manager detail and one for partner status", () => {
    expect(repository).toContain('client.rpc("get_onboarding_request_detail_v3"');
    expect(repository).toContain('client.rpc("get_own_onboarding_status_center"');
  });
  it("uses one enriched queue aggregate without live 1C", () => {
    expect(repository).toContain('client.rpc("get_onboarding_queue_v2"');
    expect(actions).not.toMatch(/searchOneC|fetchPartner|OneCPartner/);
  });
  it("enforces ownership inside partner mutations", () => {
    expect(migration).toContain("where user_profile_id = actor_id and onboarding_status = 'clarification_requested'");
  });
  it("revokes direct table access from authenticated users", () => {
    expect(migration).toContain("revoke all on table public.onboarding_notification_outbox from anon, authenticated");
  });
  it("renders 44px controls and mobile grids", () => {
    expect(managerUi).toContain("min-h-11");
    expect(correctionUi).toContain("sm:grid-cols-2");
    expect(partnerUi).toContain("sm:px-6");
  });
  it("keeps the waiting page free of raw identifiers and internal fields", () => {
    expect(partnerUi).not.toMatch(/UUID|external1c|internalNote|priceProfile|permission/i);
  });
});
