import "server-only";

import type { AdminPublicPartnerDirectoryRepository } from "../repositories";
import { SupabaseAdminPublicPartnerDirectoryRepository } from "../repositories";
import {
  ADMIN_PUBLIC_PARTNER_FILTERS,
  type AdminPublicPartnerDirectoryPage,
  type AdminPublicPartnerFilter,
} from "../types";
import {
  PUBLIC_PARTNER_CAPABILITY_CODES,
  type PublicPartnerCapabilityDto,
} from "@/src/modules/public-retail/types";

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
    publicSlug: string;
    descriptionRu: string;
    descriptionRo: string;
    locality: string;
    publicEmail: string;
    publicPhone: string;
    publicWebsite: string;
    capabilities: PublicPartnerCapabilityDto[];
    visible: boolean;
    useCurrentLogo: boolean;
    correlationId: string;
  }) {
    const publicDisplayName = input.publicDisplayName.trim();
    const publicSlug = input.publicSlug.trim().toLowerCase();
    const descriptionRu = input.descriptionRu.trim();
    const descriptionRo = input.descriptionRo.trim();
    const locality = input.locality.trim();
    const publicEmail = input.publicEmail.trim().toLowerCase();
    const publicPhone = input.publicPhone.trim();
    const publicWebsite = input.publicWebsite.trim();
    const capabilities = normalizeCapabilities(input.capabilities);
    if (!UUID.test(input.companyId) || !UUID.test(input.correlationId)
      || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
      || (publicDisplayName && (publicDisplayName.length < 2 || publicDisplayName.length > 160))
      || (publicSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug))
      || publicSlug.length > 120
      || invalidOptionalText(descriptionRu, 2000)
      || invalidOptionalText(descriptionRo, 2000)
      || invalidOptionalText(locality, 120)
      || (publicEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail) || publicEmail.length > 254))
      || (publicPhone && !/^\+[1-9][0-9]{7,14}$/.test(publicPhone))
      || (publicWebsite && !isSafeWebsite(publicWebsite))
      || (input.visible && !publicDisplayName)) {
      throw new Error(input.visible && !publicDisplayName
        ? "PUBLIC_PARTNER_NAME_REQUIRED"
        : "PUBLIC_PARTNER_INPUT_INVALID");
    }
    return this.repository.update({
      ...input,
      publicDisplayName,
      publicSlug,
      descriptionRu,
      descriptionRo,
      locality,
      publicEmail,
      publicPhone,
      publicWebsite,
      capabilities,
    });
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

function invalidOptionalText(value: string, maxLength: number): boolean {
  return Boolean(value && (value.length < 2 || value.length > maxLength));
}

function isSafeWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && value.length <= 500;
  } catch {
    return false;
  }
}

function normalizeCapabilities(capabilities: PublicPartnerCapabilityDto[]) {
  if (capabilities.length > PUBLIC_PARTNER_CAPABILITY_CODES.length) throw new Error("PUBLIC_PARTNER_CAPABILITIES_INVALID");
  const seen = new Set<string>();
  return capabilities.map((capability) => {
    if (!PUBLIC_PARTNER_CAPABILITY_CODES.includes(capability.code)
      || !["SELF_DECLARED", "VERIFIED"].includes(capability.evidenceStatus)
      || seen.has(capability.code)) {
      throw new Error("PUBLIC_PARTNER_CAPABILITIES_INVALID");
    }
    seen.add(capability.code);
    return capability;
  }).sort((left, right) => left.code.localeCompare(right.code));
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
