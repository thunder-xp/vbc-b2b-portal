import type { PublicPartnerDirectoryEntryDto } from "../types";
import type { PublicPartnerDirectoryRepository } from "../repositories/public-partner-directory.repository";

export class PublicPartnerDirectoryService {
  constructor(private readonly repository: PublicPartnerDirectoryRepository) {}

  async listPartners(): Promise<PublicPartnerDirectoryEntryDto[]> {
    const records = await this.repository.listPublished();
    return records.map((record) => ({
      displayName: record.displayName,
      logoUrl: publicPartnerLogoUrl(record.logoAssetPath),
    }));
  }
}

function publicPartnerLogoUrl(assetPath: string | null): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!assetPath || !baseUrl) return null;
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/render/image/public/company-logos/${encodedPath}?width=320&height=180&resize=contain&quality=75`;
}
