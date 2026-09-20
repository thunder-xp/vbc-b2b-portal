import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import { parsePublicPartnerDetailRecord, parsePublicPartnerDirectoryResult } from "../../validation";
import type { PublicPartnerDirectoryRepository } from "../public-partner-directory.repository";

export class PublicPartnerDirectoryRepositoryError extends Error {
  constructor() {
    super("Public partner directory is temporarily unavailable.");
    this.name = "PublicPartnerDirectoryRepositoryError";
  }
}

export class SupabasePublicPartnerDirectoryRepository implements PublicPartnerDirectoryRepository {
  async listPublished(input: Parameters<PublicPartnerDirectoryRepository["listPublished"]>[0]) {
    const { data, error } = await createPublicReadClient({ cache: "no-store" }).rpc("list_public_partner_directory", {
      p_search: input.search || null,
      p_locality: input.locality || null,
      p_capability: input.capability,
      p_limit: 100,
    });
    if (error) throw new PublicPartnerDirectoryRepositoryError();
    return parsePublicPartnerDirectoryResult(data);
  }

  async getPublishedBySlug(slug: string) {
    const { data, error } = await createPublicReadClient({ cache: "no-store" }).rpc("get_public_partner_profile", {
      p_slug: slug,
    });
    if (error) throw new PublicPartnerDirectoryRepositoryError();
    return parsePublicPartnerDetailRecord(data);
  }
}
