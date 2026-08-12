import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { PublicRetailPublicationRepository } from "../public-retail.repository";
import { parsePublicRetailPublicationMetrics } from "../../validation";
import { PublicRetailRepositoryError } from "./public-retail.supabase-repository";

export class SupabasePublicRetailPublicationRepository implements PublicRetailPublicationRepository {
  async start(): Promise<string> {
    const { data, error } = await createAdminClient().rpc("start_public_retail_publication");
    if (error || typeof data !== "string") throw new PublicRetailRepositoryError();
    return data;
  }

  async build(publicationId: string) {
    const { data, error } = await createAdminClient().rpc("build_public_retail_candidate", {
      p_publication_id: publicationId,
    });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailPublicationMetrics(data);
  }

  async publish(publicationId: string, checksum: string): Promise<void> {
    const { error } = await createAdminClient().rpc("publish_public_retail_candidate", {
      p_publication_id: publicationId,
      p_checksum_sha256: checksum,
    });
    if (error) throw new PublicRetailRepositoryError();
  }

  async fail(publicationId: string, safeError: string): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_public_retail_candidate", {
      p_publication_id: publicationId,
      p_safe_error: safeError,
    });
    if (error) throw new PublicRetailRepositoryError();
  }
}
