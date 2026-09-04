import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { SupabaseOrderPriceRefreshRepository } from "@/src/modules/orders/repositories/supabase/order-price-refresh.supabase-repository";

import type {
  GovernedPriceCoverageCandidate,
  GovernedPriceCoverageSnapshot,
  PriceCoverageAuditRepository,
} from "./price-coverage-audit.repository";

type CandidateRow = {
  product_id: string;
  sku: string;
  product_name: string;
  external_product_ref: string;
  external_price_type_ref: string;
  price_type_name: string;
  priority: number;
  active_cart_count: number | string;
  active_cart_line_count: number | string;
  recent_order_count: number | string;
  total_quantity: number | string;
  company_ids: string[];
  company_names: string[];
  latest_exposure_at: string;
};

export class SupabasePriceCoverageAuditRepository implements PriceCoverageAuditRepository {
  private readonly publisher = new SupabaseOrderPriceRefreshRepository();

  async listCandidates(limit: number): Promise<GovernedPriceCoverageCandidate[]> {
    const { data, error } = await createAdminClient().rpc(
      "list_governed_price_coverage_candidates",
      { p_limit: limit },
    );
    if (error || !Array.isArray(data)) {
      throw new Error(`Price coverage candidates could not be read (${error?.code ?? "INVALID_RESULT"}).`);
    }
    return (data as CandidateRow[]).map(mapCandidate);
  }

  async getSnapshot(): Promise<GovernedPriceCoverageSnapshot> {
    const { data, error } = await createAdminClient().rpc("get_admin_governed_price_coverage");
    if (error || !isSnapshot(data)) {
      throw new Error(`Price coverage snapshot could not be read (${error?.code ?? "INVALID_RESULT"}).`);
    }
    return data;
  }

  publishVerifiedPrices(
    input: Parameters<PriceCoverageAuditRepository["publishVerifiedPrices"]>[0],
  ): Promise<number> {
    return this.publisher.publishVerifiedPrices(input);
  }
}

function mapCandidate(row: CandidateRow): GovernedPriceCoverageCandidate {
  return {
    productId: row.product_id,
    sku: row.sku,
    productName: row.product_name,
    externalProductRef: row.external_product_ref,
    externalPriceTypeRef: row.external_price_type_ref,
    priceTypeName: row.price_type_name,
    priority: row.priority === 1 ? 1 : 2,
    activeCartCount: Number(row.active_cart_count),
    activeCartLineCount: Number(row.active_cart_line_count),
    recentOrderCount: Number(row.recent_order_count),
    totalQuantity: Number(row.total_quantity),
    companyIds: row.company_ids,
    companyNames: row.company_names,
    latestExposureAt: row.latest_exposure_at,
  };
}

function isSnapshot(value: unknown): value is GovernedPriceCoverageSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GovernedPriceCoverageSnapshot>;
  return typeof candidate.generatedAt === "string"
    && typeof candidate.summary?.activeCarts === "number"
    && typeof candidate.summary.nonEmptyActiveCarts === "number"
    && typeof candidate.summary.activeCartsBlocked === "number"
    && Array.isArray(candidate.issues);
}
