import "server-only";

import type { AdminPublicPartnerDirectoryRepository } from "../repositories";
import { SupabaseAdminPublicPartnerDirectoryRepository } from "../repositories";
import {
  ADMIN_PUBLIC_PARTNER_FILTERS,
  type AdminPublicPartnerDirectoryPage,
  type AdminPublicPartnerFilter,
} from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AdminPublicPartnerDirectoryService {
  constructor(private readonly repository: AdminPublicPartnerDirectoryRepository) {}

  async list(input: { page?: string; search?: string; filter?: string }): Promise<AdminPublicPartnerDirectoryPage> {
    const page = positiveInteger(input.page);
    const search = input.search?.trim().slice(0, 100) ?? "";
    const filter = normalizeFilter(input.filter);
    const result = await this.repository.list({ page, pageSize: 25, search, filter });
    return {
      ...result,
      totalPages: Math.max(1, Math.ceil(result.totalCount / result.pageSize)),
      search,
      filter,
    };
  }

  update(input: {
    companyId: string;
    expectedRevision: number;
    publicDisplayName: string;
    visible: boolean;
    useCurrentLogo: boolean;
    correlationId: string;
  }) {
    const publicDisplayName = input.publicDisplayName.trim();
    if (!UUID.test(input.companyId) || !UUID.test(input.correlationId)
      || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
      || (publicDisplayName && (publicDisplayName.length < 2 || publicDisplayName.length > 160))
      || (input.visible && !publicDisplayName)) {
      throw new Error(input.visible && !publicDisplayName
        ? "PUBLIC_PARTNER_NAME_REQUIRED"
        : "PUBLIC_PARTNER_INPUT_INVALID");
    }
    return this.repository.update({ ...input, publicDisplayName });
  }

  updateLogo(input: {
    companyId: string;
    expectedRevision: number;
    logoAssetPath: string | null;
    correlationId: string;
  }) {
    if (!UUID.test(input.companyId) || !UUID.test(input.correlationId)
      || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
      || (input.logoAssetPath !== null
        && !new RegExp(
          `^${input.companyId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp)$`,
          "i",
        ).test(input.logoAssetPath))) {
      throw new Error("ADMIN_COMPANY_LOGO_INPUT_INVALID");
    }
    return this.repository.updateLogo(input);
  }
}

function positiveInteger(value?: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeFilter(value?: string): AdminPublicPartnerFilter {
  return ADMIN_PUBLIC_PARTNER_FILTERS.includes(value as AdminPublicPartnerFilter)
    ? value as AdminPublicPartnerFilter
    : "all";
}

const service = new AdminPublicPartnerDirectoryService(new SupabaseAdminPublicPartnerDirectoryRepository());

export function createAdminPublicPartnerDirectoryService() {
  return service;
}
