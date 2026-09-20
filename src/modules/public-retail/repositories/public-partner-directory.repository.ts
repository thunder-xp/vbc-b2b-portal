import type { PublicPartnerCapabilityCode } from "../types";

export type PublicPartnerCapabilityRecord = {
  code: PublicPartnerCapabilityCode;
  evidenceStatus: "SELF_DECLARED" | "VERIFIED";
};

export type PublicPartnerDirectoryRecord = {
  slug: string | null;
  displayName: string;
  logoAssetPath: string | null;
  locality: string | null;
  capabilities: PublicPartnerCapabilityRecord[];
  updatedAt: string | null;
};

export type PublicPartnerDirectoryResult = {
  items: PublicPartnerDirectoryRecord[];
  localities: string[];
  capabilities: PublicPartnerCapabilityCode[];
};

export type PublicPartnerDetailRecord = PublicPartnerDirectoryRecord & {
  descriptionRu: string | null;
  descriptionRo: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publicWebsite: string | null;
};

export interface PublicPartnerDirectoryRepository {
  listPublished(input: {
    search: string;
    locality: string;
    capability: PublicPartnerCapabilityCode | null;
  }): Promise<PublicPartnerDirectoryResult>;
  getPublishedBySlug(slug: string): Promise<PublicPartnerDetailRecord | null>;
}
