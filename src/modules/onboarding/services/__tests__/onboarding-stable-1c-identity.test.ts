import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260925120000_onboarding_stable_1c_identity.sql"),
  "utf8",
);
const actions = readFileSync(
  resolve("src/modules/onboarding/actions/onboarding.actions.ts"),
  "utf8",
);
const agentContract = readFileSync(resolve("AGENTS.md"), "utf8");

describe("stable 1C identity for onboarding", () => {
  it("stores stable counterparty and price-type Ref_Keys beside replaceable snapshot caches", () => {
    expect(migration).toContain("confirmed_counterparty_external_1c_id text null");
    expect(migration).toContain("selected_price_profile_external_1c_id text null");
    expect(migration).toContain("confirmed_counterparty_id is only the current published snapshot cache");
    expect(migration).toContain("selected_price_profile_id is only the current published snapshot cache");
  });

  it("backfills exact historical identities without matching by name", () => {
    const backfill = migration.slice(
      migration.indexOf("-- Backfill only"),
      migration.indexOf("alter table public.onboarding_events"),
    );
    expect(backfill).toContain("counterparty.id = draft.confirmed_counterparty_id");
    expect(backfill).toContain("profile.id = draft.selected_price_profile_id");
    expect(backfill).not.toContain("normalized_name");
    expect(backfill).not.toContain("counterparty.name");
  });

  it("resolves current published rows by stable identity and exact fiscal identity", () => {
    expect(migration).toContain("resolve_onboarding_counterparty_snapshot");
    expect(migration).toContain("lower(candidate.external_1c_id) = lower(btrim(p_external_1c_id))");
    expect(migration).toContain("candidate.normalized_fiscal_code = normalized_fiscal");
    expect(migration).toContain("if fiscal_matches <> 1 then");
    expect(migration).toContain("counterparty_no_longer_active");
    expect(migration).toContain("counterparty_identity_conflict");
  });

  it("fails closed for inactive, deleted, ambiguous, conflicting, and invalid price identities", () => {
    expect(migration).toContain("if not resolved_active or resolved_deleted then");
    expect(migration).toContain("if stable_matches <> 1 then");
    expect(migration).toContain("resolved_fiscal is distinct from normalized_fiscal");
    expect(migration).toContain("if profile_matches <> 1 then");
    expect(migration).toContain("raise exception 'invalid_price_profile'");
  });

  it("rebases detail, save, and approval without changing concurrency tokens", () => {
    expect(migration).toContain("get_onboarding_request_detail_v4_snapshot_row_base");
    expect(migration).toContain("save_onboarding_approval_draft_snapshot_row_base");
    expect(migration).toContain("approve_partner_access_request_v3_snapshot_row_base");
    expect(migration).toContain("pg_advisory_xact_lock");
    const rebaseBody = migration.slice(
      migration.indexOf("create or replace function public.rebase_onboarding_1c_snapshot_references"),
      migration.indexOf("-- Retain the proven engines"),
    );
    expect(rebaseBody).not.toMatch(/set[\s\S]{0,300}\bversion\s*=/);
    expect(rebaseBody).not.toContain("approval_attempt_key =");
    expect(rebaseBody).not.toContain("request_revision_id =");
  });

  it("keeps idempotent approval ahead of rebasing and emits a safe rebase audit", () => {
    const approval = migration.slice(
      migration.indexOf("create function public.approve_partner_access_request_v3("),
      migration.indexOf("-- Automatically rebase only rows"),
    );
    expect(approval.indexOf("existing_attempt.status = 'succeeded'")).toBeLessThan(
      approval.indexOf("rebase_onboarding_1c_snapshot_references"),
    );
    expect(migration).toContain("'operation', 'ONBOARDING_1C_SNAPSHOT_REBASED'");
    expect(migration).toContain("encode(extensions.digest(counterparty_ref, 'sha256'), 'hex')");
    expect(migration).toContain("'old_snapshot_version'");
    expect(migration).toContain("'new_snapshot_version'");
  });

  it("does not introduce durable contract snapshot IDs", () => {
    expect(migration).not.toMatch(/selected_contract_id|confirmed_contract_id|contract_snapshot_id/);
    expect(agentContract).toContain("Durable onboarding and commercial references use the 1C `Ref_Key`");
    expect(agentContract).toContain("Never recover identity by company name");
  });

  it("shows explicit inactive and identity-conflict messages", () => {
    expect(actions).toContain('counterparty_no_longer_active: "Компания больше не активна в 1С."');
    expect(actions).toContain('counterparty_identity_conflict: "Конфликт идентичности 1С. Требуется проверка администратора."');
    expect(actions).not.toContain("Справочник 1С обновился. Подтвердите компанию заново.");
  });
});
