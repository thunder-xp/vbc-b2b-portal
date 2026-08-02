import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdminPartnerIntegrityRepository } from "../../repositories";
import { AdminPartnerIntegrityService } from "../admin-partner-integrity.service";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260802140000_partner_integrity_repairs.sql"),
  "utf8",
);

describe("partner integrity repair migration", () => {
  it("defines every approved-onboarding integrity outcome", () => {
    for (const outcome of [
      "consistent", "company_missing", "membership_missing",
      "membership_company_mismatch", "company_inactive", "1c_mapping_missing",
      "duplicate_company", "duplicate_membership", "approval_incomplete",
    ]) expect(migration).toContain(`'${outcome}'`);
  });

  it("keeps repair atomic, permission-gated, idempotent, and optimistic", () => {
    expect(migration).toContain("create or replace function public.repair_approved_onboarding_connection");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("admin.partner_integrity.manage");
    expect(migration).toContain("operation_key uuid not null unique");
    expect(migration).toContain("source_membership.version <> p_expected_source_version");
    expect(migration).toContain("stale_membership_version");
  });

  it("uses the deployed unified permission schema", () => {
    expect(migration).toContain("delegable_by_partner_owner");
    expect(migration).toContain("sensitive");
    expect(migration).not.toContain("is_partner_assignable");
    expect(migration).not.toContain("is_internal_assignable");
  });

  it("validates the published 1C directory fiscal identity without free-text refs", () => {
    expect(migration).toContain("counterparty.normalized_fiscal_code is distinct from normalized_fiscal");
    expect(migration).toContain("candidate.is_published and candidate.normalized_fiscal_code = normalized_fiscal");
    expect(migration).not.toContain("p_external_1c_id");
  });

  it("implements explicit move and add without changing membership company_id", () => {
    expect(migration).toContain("p_mode not in ('move', 'add')");
    expect(migration).toContain("if p_mode = 'move'");
    expect(migration).toContain("status = 'revoked'");
    expect(migration).not.toMatch(/update public\.company_memberships\s+set company_id/i);
  });

  it("creates full access, one bootstrap, default context, and immutable audit", () => {
    expect(migration).toContain("assign_default_partner_company_access");
    expect(migration).toContain("partner_company_bootstrap_jobs");
    expect(migration).toContain("user_company_context_preferences");
    expect(migration).toContain("prevent_partner_integrity_repair_event_mutation");
    expect(migration).toContain("rollback_smoke_succeeded");
    expect(migration).toContain("revision.requested_company_name");
  });
});

describe("AdminPartnerIntegrityService", () => {
  it("passes a reviewed move to the repository", async () => {
    const repository = stubRepository();
    const service = new AdminPartnerIntegrityService(repository);
    const input = validInput();
    await service.repairApprovedRequest(input);
    expect(repository.repairApprovedRequest).toHaveBeenCalledWith(input);
  });

  it("keeps add distinct from move", async () => {
    const repository = stubRepository();
    const service = new AdminPartnerIntegrityService(repository);
    await service.mutateMembership({
      ...validInput(),
      mode: "add",
      userId: "ec720a2a-dc2c-4959-890a-4beb2ed0229b",
      targetCompanyId: "77dc3f2c-f3d1-4777-aeba-989a481eee35",
    });
    expect(repository.mutateMembership).toHaveBeenCalledWith(expect.objectContaining({ mode: "add" }));
  });

  it("requires an audit reason", async () => {
    const service = new AdminPartnerIntegrityService(stubRepository());
    expect(() => service.repairApprovedRequest({ ...validInput(), reason: "short" })).toThrow("invalid_integrity_repair");
  });
});

function validInput() {
  return {
    requestId: "ec8b1973-65ae-4006-8e54-7e3ef277c587",
    counterpartyId: "3ad268dc-aee1-4100-894e-459f1e206bc7",
    sourceMembershipId: "24da733c-3025-4033-8e3d-bed17d482ca6",
    expectedSourceVersion: 1,
    mode: "move" as const,
    roleCode: "partner_owner",
    reason: "Incorrect company assignment during legacy onboarding.",
    operationKey: "2be4df62-a2fa-4e34-a18a-a38efb6b78a7",
    correlationId: "84d9918d-763a-409a-b30d-011040901860",
  };
}

function stubRepository(): AdminPartnerIntegrityRepository {
  return {
    getUser: vi.fn(),
    diagnose: vi.fn(),
    listTargetCompanies: vi.fn(),
    repairApprovedRequest: vi.fn().mockResolvedValue({}),
    mutateMembership: vi.fn().mockResolvedValue({}),
  };
}
