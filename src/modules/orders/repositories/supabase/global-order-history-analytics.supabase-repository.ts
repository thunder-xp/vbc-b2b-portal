import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  GlobalOrderHistoryAnalyticsRepository,
  GlobalOrderProductMembershipPage,
} from "../global-order-history-analytics.repository";
import { GlobalOrderHistoryAnalyticsRepositoryError } from "../global-order-history-analytics.repository";

type MembershipRow = {
  order_history_id?: unknown;
  order_date?: unknown;
  product_ids?: unknown;
};

export class SupabaseGlobalOrderHistoryAnalyticsRepository
implements GlobalOrderHistoryAnalyticsRepository {
  async getOrderProductMembershipPage(
    input: Parameters<GlobalOrderHistoryAnalyticsRepository["getOrderProductMembershipPage"]>[0],
  ): Promise<GlobalOrderProductMembershipPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 500, 1000));
    const { data, error } = await createAdminClient().rpc(
      "get_global_b2b_order_product_membership",
      {
        p_date_from: input.dateFrom,
        p_date_to: input.dateTo,
        p_after_order_date: input.afterOrderDate ?? null,
        p_after_order_id: input.afterOrderHistoryId ?? null,
        p_limit: limit,
      },
    );
    if (error || !Array.isArray(data)) throw new GlobalOrderHistoryAnalyticsRepositoryError();
    const items = (data as MembershipRow[]).map((row) => {
      if (
        typeof row.order_history_id !== "string"
        || typeof row.order_date !== "string"
        || !Array.isArray(row.product_ids)
        || row.product_ids.some((value) => typeof value !== "string")
      ) {
        throw new GlobalOrderHistoryAnalyticsRepositoryError();
      }
      return {
        orderHistoryId: row.order_history_id,
        orderDate: row.order_date,
        productIds: row.product_ids as string[],
      };
    });
    const last = items.at(-1);
    return {
      items,
      nextCursor: items.length === limit && last
        ? { orderDate: last.orderDate, orderHistoryId: last.orderHistoryId }
        : null,
    };
  }
}
