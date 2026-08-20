import "server-only";

import type { PartnerProvider } from "@/src/modules/integration/contracts";

import type { AdminCompanyRepository } from "../repositories";
import { SupabaseAdminCompanyRepository } from "../repositories";
import {
  ADMIN_COMPANY_FILTERS,
  type AdminCompanyFilter,
  type AdminCompanyOverview,
  type AdminCompanyPage,
  type AdminCompanyAccess,
  type AdminCommercialProfileSyncResult,
  type AdminCompanyContractMappingProjection,
  type AdminContractMappingResult,
  type PartnerAccessPresetCode,
  PARTNER_ACCESS_PRESETS,
} from "../types";

const COMPANY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListAdminCompaniesInput = {
  page?: string | number;
  search?: string;
  filter?: string;
};

export class AdminCompanyService {
  constructor(private readonly repository: AdminCompanyRepository) {}

  list(input: ListAdminCompaniesInput): Promise<AdminCompanyPage> {
    return this.repository.list({
      page: normalizePage(input.page),
      pageSize: 25,
      search: normalizeSearch(input.search),
      filter: normalizeFilter(input.filter),
    });
  }

  getOverview(companyId: string): Promise<AdminCompanyOverview | null> {
    if (!COMPANY_ID_PATTERN.test(companyId)) return Promise.resolve(null);
    return this.repository.getOverview(companyId);
  }

  getAccess(companyId: string): Promise<AdminCompanyAccess | null> {
    if (!COMPANY_ID_PATTERN.test(companyId)) return Promise.resolve(null);
    return this.repository.getAccess(companyId);
  }

  getContractMapping(companyId: string): Promise<AdminCompanyContractMappingProjection | null> {
    if (!COMPANY_ID_PATTERN.test(companyId)) return Promise.resolve(null);
    return this.repository.getContractMapping(companyId);
  }

  mapContract(input: {
    companyId: string;
    contractRef: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
  }): Promise<AdminContractMappingResult> {
    const reason = input.reason.trim();
    if (
      !COMPANY_ID_PATTERN.test(input.companyId)
      || !COMPANY_ID_PATTERN.test(input.contractRef)
      || !COMPANY_ID_PATTERN.test(input.correlationId)
      || !Number.isInteger(input.expectedVersion)
      || input.expectedVersion < 1
      || reason.length < 10
      || reason.length > 500
    ) {
      throw new Error("Invalid contract mapping request.");
    }
    return this.repository.mapContract({ ...input, reason });
  }

  async synchronizeCommercialProfile(input: {
    companyId: string;
    expectedVersion: number;
    reason: string;
    correlationId: string;
    provider: PartnerProvider;
  }): Promise<AdminCommercialProfileSyncResult> {
    const reason = input.reason.trim();
    if (
      !COMPANY_ID_PATTERN.test(input.companyId)
      || !COMPANY_ID_PATTERN.test(input.correlationId)
      || !Number.isInteger(input.expectedVersion)
      || input.expectedVersion < 1
      || reason.length < 10
      || reason.length > 500
    ) {
      throw new Error("Invalid commercial profile synchronization request.");
    }

    const claim = await this.repository.beginCommercialProfileSync({
      companyId: input.companyId,
      expectedVersion: input.expectedVersion,
      reason,
      correlationId: input.correlationId,
    });
    if (!claim.claimed || !claim.runId || !claim.counterpartyRef || !claim.contractRef) {
      return claim;
    }

    try {
      const source = await input.provider.fetchCommercialProfile({
        partnerReference: claim.counterpartyRef,
        contractReference: claim.contractRef,
      });
      return await this.repository.publishCommercialProfileSync(claim.runId, source);
    } catch (error) {
      await this.repository.failCommercialProfileSync(
        claim.runId,
        error instanceof Error ? error.name : "provider_failure",
      );
      throw error;
    }
  }

  updateAccess(input: {
    companyId: string;
    expectedVersion: number;
    presetCode: string;
    enabledPermissionCodes: string[];
    note?: string;
    correlationId: string;
  }): Promise<{ version: number; correlationId: string }> {
    if (!COMPANY_ID_PATTERN.test(input.companyId)
      || !COMPANY_ID_PATTERN.test(input.correlationId)
      || !Number.isInteger(input.expectedVersion)
      || input.expectedVersion < 1
      || !PARTNER_ACCESS_PRESETS.includes(input.presetCode as PartnerAccessPresetCode)) {
      throw new Error("Invalid company access update.");
    }
    const permissionCodes = [...new Set(input.enabledPermissionCodes.map((code) => code.trim()).filter(Boolean))];
    return this.repository.updateAccess({
      companyId: input.companyId,
      expectedVersion: input.expectedVersion,
      presetCode: input.presetCode as PartnerAccessPresetCode,
      enabledPermissionCodes: permissionCodes,
      note: input.note?.trim().slice(0, 500) || null,
      correlationId: input.correlationId,
    });
  }
}

export function normalizeCompanyFilter(value?: string): AdminCompanyFilter {
  return normalizeFilter(value);
}

function normalizePage(value?: string | number): number {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeSearch(value?: string): string {
  return value?.trim().slice(0, 100) ?? "";
}

function normalizeFilter(value?: string): AdminCompanyFilter {
  return ADMIN_COMPANY_FILTERS.includes(value as AdminCompanyFilter)
    ? (value as AdminCompanyFilter)
    : "all";
}

const service = new AdminCompanyService(new SupabaseAdminCompanyRepository());

export function createAdminCompanyService(): AdminCompanyService {
  return service;
}
