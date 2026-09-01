import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { UserProfileService } from "../../../access-control/services";
import { ForbiddenError } from "../../../access-control/services";
import { UserStatus, UserType } from "../../../access-control/types";
import type { PricingInventoryRepository } from "../../repositories";
import type { CommercialRate, CommercialRateVerification, PublishCommercialRateInput, VerifyCommercialRateInput } from "../../types";
import {
  CommercialRateManagementService,
  CommercialRateValidationError,
  validatePublication,
} from "../commercial-rate-management.service";

describe("CommercialRateManagementService", () => {
  it("allows an authorized internal user and never accepts publisher identity in input", async () => {
    const repository = createRepository();
    const service = new CommercialRateManagementService(repository, profiles(UserType.Internal));
    const published = await service.publish("internal-1", input());

    expect(published.publishedBy).toBe("server-user");
    expect(repository.publishManualCommercialRate).toHaveBeenCalledWith({
      purpose: "partner_price_usd_to_mdl",
      rate: "17.7712",
      effectiveDate: "2026-07-18",
      sourceNote: "Курс скопирован из 1С",
      evidenceComment: null,
    });
  });

  it("rejects a partner even if a repository stub claims permission", async () => {
    const service = new CommercialRateManagementService(createRepository(), profiles(UserType.Partner));
    await expect(service.publish("partner-1", input())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps both purposes and projects verification independently", async () => {
    const repository = createRepository([
      rate("partner-current", "partner_price_usd_to_mdl", 17.3504, true, "partner-old"),
      rate("retail-current", "retail_price_usd_to_mdl", 17.7712, true, "retail-old"),
      rate("partner-old", "partner_price_usd_to_mdl", 17.5, false),
      rate("retail-old", "retail_price_usd_to_mdl", 17.6, false),
    ]);
    const view = await new CommercialRateManagementService(repository, profiles(UserType.Admin)).getAdminView("admin-1");

    expect(view.rates.map((row) => row.current?.rate)).toEqual([17.3504, 17.7712]);
    expect(view.rates[0]?.verificationStatus).toBe("NOT_VERIFIED");
    expect(view.rates[1]?.verificationStatus).toBe("NOT_VERIFIED");
  });

  it("derives current comparison from latest evidence and the active portal rate", async () => {
    const staleMatch = verificationRow({
      activePortalRate: 17.095,
      observed1cRate: 17.095,
      verificationStatus: "MATCHES_1C",
    });
    const repository = createRepository([
      rate("partner-current", "partner_price_usd_to_mdl", 17.3504, true),
    ], [staleMatch]);

    const view = await new CommercialRateManagementService(repository, profiles(UserType.Admin)).getAdminView("admin-1");

    expect(view.rates[0]?.latestVerification).toBe(staleMatch);
    expect(view.rates[0]?.verificationStatus).toBe("DIFFERS_FROM_1C");
  });

  it("keeps verify-only and publish-observed commands separate", async () => {
    const repository = createRepository();
    const service = new CommercialRateManagementService(repository, profiles(UserType.Admin));
    await service.verify("admin-1", verificationInput());
    expect(repository.saveManualCommercialRateVerification).toHaveBeenCalledOnce();
    expect(repository.publishVerifiedCommercialRate).not.toHaveBeenCalled();
    await service.publishObserved("admin-1", verificationInput());
    expect(repository.publishVerifiedCommercialRate).toHaveBeenCalledOnce();
  });

  it.each(["0", "-1", "NaN", "17.123456789"])("rejects unsafe rate %s", (value) => {
    expect(() => validatePublication(input({ rate: value }))).toThrow(CommercialRateValidationError);
  });
});

describe("manual commercial-rate publication migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718120000_manual_commercial_rate_publication.sql"), "utf8");
  const repairSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718123000_manual_commercial_rate_purpose_repair.sql"), "utf8");
  const directionSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260718160000_commercial_rate_direction_correction.sql"), "utf8");
  const idempotencySql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901162149_make_manual_commercial_rate_publication_idempotent.sql"), "utf8");

  it("isolates purposes, serializes publication, and rejects older effective dates", () => {
    expect(sql).toContain("commercial_exchange_rates_one_active_purpose_idx");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("p_effective_at < current_rate.effective_at");
    expect(sql).toContain("previous_rate_id");
  });

  it("derives publisher identity from auth and grants no table writes", () => {
    expect(sql).toContain("actor_id uuid := auth.uid()");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[^;]+commercial_exchange_rates/i);
    expect(sql).toContain("to authenticated");
  });

  it("keeps publication atomic and purpose-specific", () => {
    expect(sql).toContain("publish_manual_commercial_exchange_rate_v2");
    expect(sql).toContain("commercial_exchange_rate_audit_events");
    expect(sql).toContain("partner_price_usd_to_mdl");
    expect(directionSql).toContain("retail_price_usd_to_mdl");
    expect(directionSql).toContain("where purpose = 'retail_price_mdl_to_usd'");
    expect(directionSql).toContain("drop constraint if exists commercial_exchange_rates_manual_fields_check");
    expect(directionSql).toMatch(/source_note is not null\s*\)\s*\);/);
    expect(directionSql).toContain("clock_timestamp()");
    expect(repairSql).toMatch(/effective_date,\s+purpose,\s+effective_at/);
    expect(repairSql).toMatch(/p_effective_at::date,\s+p_purpose,\s+p_effective_at/);
  });

  it("returns the active version for a semantic replay before writing history", () => {
    expect(idempotencySql).toContain("current_rate.rate = p_rate::numeric(18, 6)");
    expect(idempotencySql).toContain("current_rate.effective_at::date = p_effective_at::date");
    expect(idempotencySql).toContain("current_rate.source_note = normalized_source_note");
    expect(idempotencySql).toContain("current_rate.evidence_comment is not distinct from normalized_evidence_comment");

    const replayReturn = idempotencySql.indexOf("return to_jsonb(current_rate)");
    const supersede = idempotencySql.indexOf("update public.commercial_exchange_rates", replayReturn);
    const insertAudit = idempotencySql.indexOf("insert into public.commercial_exchange_rate_audit_events", replayReturn);
    expect(replayReturn).toBeGreaterThan(0);
    expect(supersede).toBeGreaterThan(replayReturn);
    expect(insertAudit).toBeGreaterThan(replayReturn);
  });

  it("keeps material rate or evidence changes on the immutable publication path", () => {
    expect(idempotencySql).toContain("insert into public.commercial_exchange_rates");
    expect(idempotencySql).toContain("previous_rate_id");
    expect(idempotencySql).toContain("'published'");
    expect(idempotencySql).toContain("pg_advisory_xact_lock");
  });
});

function input(overrides: Partial<PublishCommercialRateInput> = {}): PublishCommercialRateInput {
  return { purpose: "partner_price_usd_to_mdl", rate: "17.7712", effectiveDate: "2026-07-18", sourceNote: "Курс скопирован из 1С", evidenceComment: null, ...overrides };
}

function rate(id: string, purpose: CommercialRate["purpose"], value: number, isActive: boolean, previousRateId: string | null = null): CommercialRate {
  return { id, purpose, rate: value, effectiveAt: "2026-07-18T00:00:00Z", publishedAt: "2026-07-18T09:00:00Z", publishedBy: "server-user", publisherName: "Manager", publisherEmail: null, sourceType: "manual_from_1c", sourceNote: "1C", evidenceComment: null, previousRateId, isActive };
}

function createRepository(history: CommercialRate[] = [], verifications: CommercialRateVerification[] = []) {
  const verification = verificationRow();
  return {
    canManageCommercialRates: vi.fn(async () => true),
    listCommercialRateHistory: vi.fn(async () => history),
    listCommercialRateVerifications: vi.fn(async () => verifications),
    publishManualCommercialRate: vi.fn(async (value: PublishCommercialRateInput) => rate("new-rate", value.purpose, Number(value.rate), true)),
    saveManualCommercialRateVerification: vi.fn(async () => ({ verification, verificationOutcome: "saved" as const })),
    publishVerifiedCommercialRate: vi.fn(async () => ({ verification, verificationOutcome: "saved" as const, publicationOutcome: "published" as const })),
  } as unknown as PricingInventoryRepository & {
    publishManualCommercialRate: ReturnType<typeof vi.fn>;
    saveManualCommercialRateVerification: ReturnType<typeof vi.fn>;
    publishVerifiedCommercialRate: ReturnType<typeof vi.fn>;
  };
}

function verificationInput(): VerifyCommercialRateInput { return { purpose: "partner_price_usd_to_mdl", observed1cRate: "17.7712", observed1cEffectiveDate: "2026-07-18", evidenceNote: "Проверено в 1С", verificationComment: null }; }
function verificationRow(overrides: Partial<CommercialRateVerification> = {}): CommercialRateVerification { return { id: "verification-1", purpose: "partner_price_usd_to_mdl", portalRateId: "rate-1", activePortalRate: 17.7712, activePortalEffectiveDate: "2026-07-18", observed1cRate: 17.7712, observed1cEffectiveDate: "2026-07-18", evidenceNote: "Проверено в 1С", verificationComment: null, verificationStatus: "VERIFIED_NO_CHANGE_REQUIRED", verifiedBy: "server-user", verifiedAt: "2026-07-18T10:00:00Z", verifierName: "Manager", verifierEmail: null, ...overrides }; }

function profiles(userType: UserType): UserProfileService {
  return {
    ensureActiveUser: vi.fn(async (id: string) => ({ id, email: `${id}@example.com`, fullName: "Manager", phone: null, status: UserStatus.Active, userType, createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z" })),
  } as unknown as UserProfileService;
}
