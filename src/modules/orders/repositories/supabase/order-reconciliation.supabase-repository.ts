import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type {
  ClaimedOrderReconciliation,
  OrderReconciliationRepository,
} from "../order.repository";
import { OrderRepositoryError } from "../order.repository";

type ClaimRow = {
  order_id: string;
  correlation_id: string;
  attempt_number: number;
};

export class SupabaseOrderReconciliationRepository implements OrderReconciliationRepository {
  async claim(limit: number, leaseSeconds: number): Promise<ClaimedOrderReconciliation[]> {
    const { data, error } = await createAdminClient().rpc(
      "claim_partner_order_reconciliations",
      { p_limit: limit, p_lease_seconds: leaseSeconds },
    );
    if (error) throw new OrderRepositoryError(error.code, error.message);
    return ((data ?? []) as ClaimRow[]).map((row) => ({
      orderId: row.order_id,
      correlationId: row.correlation_id,
      attemptNumber: Number(row.attempt_number),
    }));
  }

  async finish(input: Parameters<OrderReconciliationRepository["finish"]>[0]): Promise<boolean> {
    const { data, error } = await createAdminClient().rpc(
      "finish_partner_order_reconciliation_attempt",
      {
        p_order_id: input.orderId,
        p_correlation_id: input.correlationId,
        p_result: input.result,
        p_safe_error_code: input.safeErrorCode ?? null,
        p_retry_after_seconds: input.retryAfterSeconds ?? null,
      },
    );
    if (error) throw new OrderRepositoryError(error.code, error.message);
    return data === true;
  }
}
