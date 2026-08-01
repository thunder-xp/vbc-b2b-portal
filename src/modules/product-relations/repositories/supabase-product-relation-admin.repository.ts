import { createClient } from "@/src/lib/supabase/server";

export type ProductRelationHealth = {
  latestRun: Record<string, unknown> | null;
  activeLock: boolean;
  published: number;
  distribution: { zero: number; one: number; twoToFive: number; overFive: number };
};

export type ProductRelationQuality = {
  publishedProducts: number;
  withoutAnalogs: number;
  withoutRelated: number;
  fewerThanTwoAnalogs: number;
  fewerThanTwoRelated: number;
};

export type ProductRelationInspectionRow = {
  sourceSku: string;
  sourceName: string;
  relationType: "analog" | "related";
  targetSku: string;
  targetName: string;
  targetActive: boolean;
  targetVisible: boolean;
  sourceVersion: string;
  totalCount: number;
};

export class SupabaseProductRelationAdminRepository {
  async getHealth(): Promise<ProductRelationHealth> {
    return this.callObject("get_product_relation_sync_health") as Promise<ProductRelationHealth>;
  }

  async getQuality(): Promise<ProductRelationQuality> {
    return this.callObject("get_product_relation_quality_report") as Promise<ProductRelationQuality>;
  }

  async inspect(search = "", relationType: "analog" | "related" | null = null): Promise<ProductRelationInspectionRow[]> {
    const client = await createClient();
    const { data, error } = await client.rpc("inspect_product_relations", {
      p_search: search.trim() || null,
      p_relation_type: relationType,
      p_limit: 50,
      p_offset: 0,
    });
    if (error || !Array.isArray(data)) throw new Error("Product relation diagnostics failed.");
    return data.map((row) => ({
      sourceSku: String(row.source_sku),
      sourceName: String(row.source_name),
      relationType: row.relation_type as "analog" | "related",
      targetSku: String(row.target_sku),
      targetName: String(row.target_name),
      targetActive: row.target_active === true,
      targetVisible: row.target_visible === true,
      sourceVersion: String(row.source_version),
      totalCount: Number(row.total_count),
    }));
  }

  private async callObject(operation: string): Promise<Record<string, unknown>> {
    const client = await createClient();
    const { data, error } = await client.rpc(operation);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Product relation diagnostics failed.");
    }
    return data as Record<string, unknown>;
  }
}
