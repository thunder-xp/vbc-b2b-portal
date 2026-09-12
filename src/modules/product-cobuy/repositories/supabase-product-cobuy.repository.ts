import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import {
  ProductCoBuyRepositoryError,
  type ProductCoBuyRepository,
} from "./product-cobuy.repository";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SupabaseProductCoBuyRepository implements ProductCoBuyRepository {
  async listCandidateProductIds(
    sourceProductId: string,
    limit: number,
  ): Promise<string[]> {
    const client = await createClient();
    const { data, error } = await client.rpc(
      "get_partner_product_cobuy_candidates",
      {
        p_source_product_id: sourceProductId,
        p_limit: Math.min(Math.max(Math.floor(limit), 1), 5),
      },
    );

    if (error) throw new ProductCoBuyRepositoryError();
    if (!Array.isArray(data)) return [];

    return data.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const candidateId = (value as Record<string, unknown>)
        .candidate_product_id;
      return typeof candidateId === "string" && UUID_PATTERN.test(candidateId)
        ? [candidateId]
        : [];
    });
  }
}
