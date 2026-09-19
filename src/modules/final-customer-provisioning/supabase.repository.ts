import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { FinalCustomerProvisioningRepository } from "./repository";

const uuid = z.string().uuid();
const claimSchema = z.object({
  eventId: uuid,
  retailOrderId: uuid,
  leaseToken: uuid,
  attemptCount: z.coerce.number().int().positive(),
}).strict();
const resultSchema = z.object({
  outcome: z.enum(["CREATED", "REUSED", "NEEDS_REVIEW"]),
  customerAccountId: uuid.nullish(),
  customerIdentityId: uuid.nullish(),
  entitlementId: uuid.nullish(),
  oneCJobState: z.literal("PENDING").nullish(),
}).passthrough();

export class FinalCustomerProvisioningRepositoryError extends Error {
  constructor(readonly code: string | null) {
    super("Final Customer provisioning repository operation failed.");
    this.name = "FinalCustomerProvisioningRepositoryError";
  }
}

export class SupabaseFinalCustomerProvisioningRepository implements FinalCustomerProvisioningRepository {
  async claim(limit: number) {
    const { data, error } = await createAdminClient().rpc("claim_customer_provisioning_events_v1", {
      p_limit: limit,
    });
    if (error) throw new FinalCustomerProvisioningRepositoryError(error.code);
    return z.array(claimSchema).max(50).parse(data ?? []);
  }

  async provision(event: Parameters<FinalCustomerProvisioningRepository["provision"]>[0]) {
    const { data, error } = await createAdminClient().rpc("provision_final_customer_from_purchase_v1", {
      p_event_id: event.eventId,
      p_lease_token: event.leaseToken,
    });
    if (error) throw new FinalCustomerProvisioningRepositoryError(error.code);
    const parsed = resultSchema.parse(data);
    return {
      outcome: parsed.outcome,
      customerAccountId: parsed.customerAccountId ?? null,
      customerIdentityId: parsed.customerIdentityId ?? null,
      entitlementId: parsed.entitlementId ?? null,
      oneCJobState: parsed.oneCJobState ?? null,
    };
  }

  async fail(event: Parameters<FinalCustomerProvisioningRepository["fail"]>[0], safeErrorCode: string) {
    const { data, error } = await createAdminClient().rpc("fail_customer_provisioning_event_v1", {
      p_event_id: event.eventId,
      p_lease_token: event.leaseToken,
      p_safe_error_code: safeErrorCode,
    });
    if (error) throw new FinalCustomerProvisioningRepositoryError(error.code);
    return data === true;
  }
}
