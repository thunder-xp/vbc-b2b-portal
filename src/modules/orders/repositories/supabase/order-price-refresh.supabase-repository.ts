import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  OrderPriceRefreshRepository,
  TargetedPriceRefreshRow,
} from "../order-price-refresh.repository";

export class SupabaseOrderPriceRefreshRepository implements OrderPriceRefreshRepository {
  async claimLease(input: {
    fingerprint: string;
    ownerToken: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    const { data, error } = await createAdminClient().rpc("claim_order_price_refresh", {
      p_fingerprint: input.fingerprint,
      p_owner_token: input.ownerToken,
      p_ttl_seconds: input.ttlSeconds,
    });
    if (error) throw new Error("Order price refresh lease could not be acquired.");
    return data === true;
  }

  async releaseLease(fingerprint: string, ownerToken: string): Promise<void> {
    const { error } = await createAdminClient().rpc("release_order_price_refresh", {
      p_fingerprint: fingerprint,
      p_owner_token: ownerToken,
    });
    if (error) throw new Error("Order price refresh lease could not be released.");
  }

  async hasVerifiedPricesSince(input: {
    externalPriceTypeRef: string;
    externalProductRefs: string[];
    verifiedSince: string;
  }): Promise<boolean> {
    const { count, error } = await createAdminClient()
      .from("product_prices")
      .select("id", { count: "exact", head: true })
      .eq("external_1c_price_type_id", input.externalPriceTypeRef)
      .in("external_product_ref", input.externalProductRefs)
      .eq("is_active", true)
      .eq("is_published", true)
      .gte("synced_at", input.verifiedSince);
    if (error) throw new Error("Verified order prices could not be read.");
    return count === input.externalProductRefs.length;
  }

  async publishVerifiedPrices(input: {
    externalPriceTypeRef: string;
    rows: TargetedPriceRefreshRow[];
    verifiedAt: string;
  }): Promise<number> {
    const { data, error } = await createAdminClient().rpc("publish_order_price_refresh", {
      p_external_price_type_ref: input.externalPriceTypeRef,
      p_rows: input.rows.map(toRpcRow),
      p_verified_at: input.verifiedAt,
    });
    if (error) throw new Error("Verified order prices could not be published.");
    return Number(data ?? 0);
  }
}

function toRpcRow(row: TargetedPriceRefreshRow) {
  return {
    external_product_ref: row.externalProductRef,
    amount: row.amount,
    effective_at: row.effectiveAt,
    is_active: row.isActive,
  };
}
