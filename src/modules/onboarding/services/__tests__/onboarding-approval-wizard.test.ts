import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ONBOARDING_BUSINESS_PROFILES,
  ONBOARDING_PAYMENT_MODEL_LABELS,
} from "../../business-profiles";

const migration = readFileSync(
  resolve("supabase/migrations/20260731150000_onboarding_approval_wizard.sql"),
  "utf8",
);
const notificationCompatibility = readFileSync(
  resolve("supabase/migrations/20260731151000_onboarding_notification_event_compatibility.sql"),
  "utf8",
);
const repository = readFileSync(
  resolve("src/modules/onboarding/repositories/supabase-onboarding.repository.ts"),
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

describe("onboarding approval business profiles", () => {
  it("maps owner, manager, buyer, accounting, and retail-only to canonical roles", () => {
    expect(Object.fromEntries(
      Object.entries(ONBOARDING_BUSINESS_PROFILES).map(([code, profile]) => [code, profile.roleCode]),
    )).toEqual({
      owner: "partner_owner",
      manager: "partner_manager",
      buyer: "partner_buyer",
      accounting: "partner_accounting",
      retail_only: "partner_viewer",
    });
  });

  it("governs finance, orders, employee administration, and retail-only redaction", () => {
    expect(ONBOARDING_BUSINESS_PROFILES.owner).toMatchObject({
      finance: true,
      orders: true,
      employeeManagement: true,
    });
    expect(ONBOARDING_BUSINESS_PROFILES.manager.finance).toBe("optional");
    expect(ONBOARDING_BUSINESS_PROFILES.buyer.finance).toBe(false);
    expect(ONBOARDING_BUSINESS_PROFILES.accounting.orders).toBe(false);
    expect(ONBOARDING_BUSINESS_PROFILES.retail_only).toMatchObject({
      partnerPrices: false,
      finance: false,
      orders: false,
    });
    expect(ONBOARDING_PAYMENT_MODEL_LABELS.inherited_from_1c).toBe("Определяется в 1С");
  });
});

describe("onboarding approval draft and atomic v3 migration", () => {
  it("preserves v2 and adds a separately versioned approval RPC", () => {
    expect(migration).toContain("approve_partner_access_request_v3");
    expect(migration).not.toContain("drop function public.approve_partner_access_request_v2");
    expect(repository).toContain('client.rpc("approve_partner_access_request_v3"');
  });

  it("persists one server-only, versioned draft per request", () => {
    expect(migration).toContain("create table if not exists public.onboarding_approval_drafts");
    expect(migration).toContain("request_id uuid primary key");
    expect(migration).toContain("version integer not null default 1");
    expect(migration).toContain("draft.request_revision_id <> request.current_revision_id");
    expect(migration).toContain("draft.version <> p_expected_draft_version");
    expect(migration).toContain("stale_approval_draft");
    expect(migration).toContain("stale_request_revision");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all).*onboarding_approval_drafts.*authenticated/i,
    );
  });

  it("blocks missing, duplicate, stale, inactive, and linked company matches", () => {
    expect(migration).toContain("counterparty_snapshot_stale");
    expect(migration).toContain("duplicate_company_conflict");
    expect(migration).toContain("counterparty_already_linked");
    expect(migration).toContain("candidate.normalized_fiscal_code = normalized_fiscal");
    expect(migration).toContain("not counterparty.is_active or counterparty.is_deleted");
    expect(migration).toContain("counterparty.portal_company_id is distinct from company.id");
  });

  it("validates synchronized price profiles and keeps retail-only partner prices denied", () => {
    expect(migration).toContain("public.one_c_counterparty_price_profiles");
    expect(migration).toContain("price_profile.is_published and price_profile.is_active");
    expect(migration).toContain("invalid_price_profile");
    expect(migration).toContain("when draft.initial_business_profile = 'retail_only' then 'deny'");
    expect(migration).toContain("when draft.initial_business_profile = 'retail_only' then null");
  });

  it("creates or reuses one company and one membership and blocks cross-company identity", () => {
    expect(migration).toContain("company_branch := 'created'");
    expect(migration).toContain("company_branch := 'reused'");
    expect(migration).toContain("membership_outcome := 'created'");
    expect(migration).toContain("membership_outcome := 'reused'");
    expect(migration).toContain("user_membership_conflict");
    expect(migration).toContain("company_id is distinct from company.id");
  });

  it("serializes concurrent approval and deduplicates approval, audit, and notification", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("unique (request_id, attempt_key)");
    expect(migration).toContain("onboarding_events_one_approval_idx");
    expect(migration).toContain("'onboarding_approved'");
    expect(migration).toContain("'onboarding_access_opened'");
    expect(migration).toContain("'onboarding-approved:' || request.id::text");
    expect(migration).toContain("on conflict (recipient_user_id, deduplication_key) do nothing");
  });

  it("rolls the atomic phase back before persisting a safe failure event", () => {
    expect(migration).toMatch(/begin[\s\S]*update public\.access_requests[\s\S]*exception when others then/);
    expect(migration).toContain("failure_code := case");
    expect(migration).toContain("'approval_failed'");
    expect(migration).toContain("'correlationId', p_correlation_id");
    expect(migration).toContain("request.onboarding_status");
  });

  it("creates the durable partner notification only after membership activation", () => {
    const membershipPosition = migration.indexOf("insert into public.company_memberships");
    const notificationPosition = migration.indexOf("insert into public.partner_notifications");
    expect(membershipPosition).toBeGreaterThan(0);
    expect(notificationPosition).toBeGreaterThan(membershipPosition);
    expect(migration).toContain("Доступ к кабинету открыт");
    expect(migration).toContain("Компания подключена к партнёрской платформе Novotech.");
    expect(migration).toContain("'Открыть кабинет', '/cabinet'");
    for (const existingCode of [
      "watched_product_back_in_stock",
      "watched_product_expected_arrival_added",
      "watched_product_arrived",
      "watched_product_price_changed",
      "cart_product_price_changed",
      "cart_product_availability_changed",
    ]) expect(notificationCompatibility).toContain(`'${existingCode}'`);
    expect(notificationCompatibility).toContain("'onboarding_access_opened'");
  });

  it("uses one aggregate and performs no live 1C or per-option reads", () => {
    expect(repository).toContain('client.rpc("get_onboarding_request_detail_v3"');
    expect(migration).toContain("jsonb_array_elements");
    expect(wizard).not.toMatch(/fetch\(|supabase|one-c|OneC/);
    expect(actions).not.toMatch(/OneCPartner|searchOneC|fetchPartner/);
  });

  it("renders four steps, safe business labels, confirmation, and mobile-safe controls", () => {
    for (const label of ["Компания", "Условия", "Пользователь", "Проверка"]) {
      expect(wizard).toContain(`label: "${label}"`);
    }
    expect(wizard).toContain("Я проверил компанию и выбранные условия доступа.");
    expect(wizard).toContain("Одобрить и открыть доступ");
    expect(wizard).toContain("min-h-11");
    expect(wizard).toContain("grid-cols-2");
    expect(wizard).not.toContain("external1cId");
    expect(wizard).not.toContain("permission.code");
  });
});
