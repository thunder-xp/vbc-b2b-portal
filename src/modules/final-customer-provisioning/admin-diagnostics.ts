import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

const itemSchema = z.object({
  job_id: z.string().uuid(),
  state: z.enum(["PENDING", "PROCESSING", "MATCHED", "NEW", "AMBIGUOUS", "CONFLICT", "FAILED_RETRYABLE"]),
  attempt_count: z.coerce.number().int().nonnegative(),
  candidate_count: z.coerce.number().int().nonnegative().nullable(),
  create_attempted: z.boolean(),
  read_back_succeeded: z.boolean(),
  mapping_persisted: z.boolean(),
  safe_error_code: z.string().max(80).nullable(),
  age_seconds: z.coerce.number().int().nonnegative(),
  updated_at: z.string().datetime({ offset: true }),
}).strict();

export async function listCustomerExternalProvisioningDiagnostics(limit = 50) {
  const { data, error } = await (await createClient()).rpc("list_customer_external_provisioning_jobs_admin_v1", {
    p_limit: Math.min(100, Math.max(1, limit)),
  });
  if (error) throw new Error(`CUSTOMER_EXTERNAL_DIAGNOSTICS_${error.code ?? "FAILED"}`);
  return z.array(itemSchema).max(100).parse(data ?? []);
}
