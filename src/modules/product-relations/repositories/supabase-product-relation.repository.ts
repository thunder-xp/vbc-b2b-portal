import { createClient } from "@/src/lib/supabase/server";
import type { ProductRelationLink, ProductRelationRepository } from "./product-relation.repository";

export class SupabaseProductRelationRepository implements ProductRelationRepository {
  async listForProduct(sourceProductId: string, limit: number): Promise<ProductRelationLink[]> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_partner_product_relations", {
      p_source_product_id: sourceProductId,
      p_limit: limit,
    });
    if (error) throw new ProductRelationRepositoryError();
    if (!Array.isArray(data)) return [];
    return data.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      if ((row.relation_type !== "analog" && row.relation_type !== "related")
        || typeof row.target_product_id !== "string"
        || typeof row.synchronized_at !== "string") return [];
      return [{
        relationType: row.relation_type,
        targetProductId: row.target_product_id,
        sourcePriority: Number.isInteger(Number(row.source_priority)) ? Number(row.source_priority) : 0,
        synchronizedAt: row.synchronized_at,
      }];
    });
  }
}

export class ProductRelationRepositoryError extends Error {
  constructor() {
    super("Product relations could not be loaded.");
    this.name = "ProductRelationRepositoryError";
  }
}
