import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { PublicRetailPublicationRepository } from "../public-retail.repository";
import { parsePublicRetailPublicationMetrics } from "../../validation";
import { PublicRetailRepositoryError } from "./public-retail.supabase-repository";

export class SupabasePublicRetailPublicationRepository implements PublicRetailPublicationRepository {
  async start(): Promise<string> {
    const { data, error } = await createAdminClient().rpc("start_public_retail_publication");
    if (error) throw publicationError("start", "start_public_retail_publication", null, error);
    if (typeof data !== "string") throw publicationError("start_result", "start_public_retail_publication", null);
    return data;
  }

  async build(publicationId: string) {
    const { data, error } = await createAdminClient().rpc("build_public_retail_candidate", {
      p_publication_id: publicationId,
    });
    if (error) throw publicationError("candidate_build", "build_public_retail_candidate", publicationId, error);
    if (isFailedBuildResult(data)) {
      throw publicationError("candidate_build", "build_public_retail_candidate", publicationId, null, {
        sqlState: data.sqlstate,
        candidateFailureRecorded: true,
      });
    }
    try {
      return parsePublicRetailPublicationMetrics(data);
    } catch {
      throw publicationError("candidate_metrics_parse", "build_public_retail_candidate", publicationId);
    }
  }

  async publish(publicationId: string, checksum: string): Promise<void> {
    const { error } = await createAdminClient().rpc("publish_public_retail_candidate", {
      p_publication_id: publicationId,
      p_checksum_sha256: checksum,
    });
    if (error) throw publicationError("atomic_publication", "publish_public_retail_candidate", publicationId, error);
  }

  async fail(publicationId: string, safeError: string): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_public_retail_candidate", {
      p_publication_id: publicationId,
      p_safe_error: safeError,
    });
    if (error) throw publicationError("failure_recording", "fail_public_retail_candidate", publicationId, error);
  }
}

function publicationError(
  operation: string,
  rpcName: string,
  publicationId: string | null,
  databaseError?: { code?: string | null; message?: string | null; details?: string | null } | null,
  options: { sqlState?: string | null; candidateFailureRecorded?: boolean } = {},
): PublicRetailRepositoryError {
  return new PublicRetailRepositoryError({
    operation,
    rpcName,
    publicationId,
    entityContext: publicationId ? { entity: "public_retail_publication", publicationId } : undefined,
    databaseError,
    sqlState: options.sqlState,
    candidateFailureRecorded: options.candidateFailureRecorded,
  });
}

function isFailedBuildResult(value: unknown): value is { failed: true; sqlstate: string | null } {
  return Boolean(value && typeof value === "object" && "failed" in value && value.failed === true &&
    "sqlstate" in value && (typeof value.sqlstate === "string" || value.sqlstate === null));
}
