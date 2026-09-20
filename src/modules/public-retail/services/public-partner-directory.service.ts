import {
  PUBLIC_PARTNER_CAPABILITY_CODES,
  type PublicPartnerCapabilityCode,
  type PublicPartnerDetailDto,
  type PublicPartnerDirectoryDto,
  type PublicPartnerDirectoryQuery,
} from "../types";
import type {
  PublicPartnerDirectoryRecord,
  PublicPartnerDirectoryRepository,
} from "../repositories/public-partner-directory.repository";

export class PublicPartnerDirectoryService {
  constructor(private readonly repository: PublicPartnerDirectoryRepository) {}

  async listPartners(input: PublicPartnerDirectoryQuery = {}): Promise<PublicPartnerDirectoryDto> {
    const search = boundedText(input.search, 100);
    const locality = boundedText(input.locality, 120);
    const capability = isCapability(input.capability) ? input.capability : null;
    const records = await this.repository.listPublished({ search, locality, capability });
    return {
      items: records.items.map(mapDirectoryRecord),
      localities: records.localities,
      capabilityCodes: records.capabilities,
    };
  }

  async getPartnerBySlug(slug: string): Promise<PublicPartnerDetailDto | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug) || normalizedSlug.length > 120) return null;
    const record = await this.repository.getPublishedBySlug(normalizedSlug);
    if (!record) return null;
    return {
      ...mapDirectoryRecord(record),
      descriptionRu: record.descriptionRu,
      descriptionRo: record.descriptionRo,
      publicEmail: record.publicEmail,
      publicPhone: record.publicPhone,
      publicWebsite: record.publicWebsite,
    };
  }
}

function mapDirectoryRecord(record: PublicPartnerDirectoryRecord) {
  return {
    slug: record.slug,
    displayName: record.displayName,
    logoUrl: publicPartnerLogoUrl(record.logoAssetPath),
    locality: record.locality,
    capabilities: record.capabilities,
    updatedAt: record.updatedAt,
  };
}

function boundedText(value: string | undefined, maxLength: number): string {
  return value?.trim().slice(0, maxLength) ?? "";
}

function isCapability(value: string | null | undefined): value is PublicPartnerCapabilityCode {
  return PUBLIC_PARTNER_CAPABILITY_CODES.includes(value as PublicPartnerCapabilityCode);
}

export function publicPartnerLogoUrl(assetPath: string | null): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!assetPath || !baseUrl) return null;
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/render/image/public/company-logos/${encodedPath}?width=320&height=180&resize=contain&quality=75`;
}
