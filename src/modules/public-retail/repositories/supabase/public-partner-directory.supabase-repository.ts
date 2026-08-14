import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import { parsePublicPartnerDirectoryRecords } from "../../validation";
import type { PublicPartnerDirectoryRepository } from "../public-partner-directory.repository";

export class PublicPartnerDirectoryRepositoryError extends Error {
  constructor() {
    super("Public partner directory is temporarily unavailable.");
    this.name = "PublicPartnerDirectoryRepositoryError";
  }
}

export class SupabasePublicPartnerDirectoryRepository implements PublicPartnerDirectoryRepository {
  async listPublished() {
    const { data, error } = await createPublicReadClient({ cache: "no-store" }).rpc("list_public_partner_directory");
    if (error) throw new PublicPartnerDirectoryRepositoryError();
    return parsePublicPartnerDirectoryRecords(data);
  }
}
