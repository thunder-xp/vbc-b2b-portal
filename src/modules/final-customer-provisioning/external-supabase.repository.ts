import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { ExternalCustomerProvisioningRepository } from "./external-types";

const uuid = z.string().uuid();
const claimSchema = z.object({
  jobId: uuid,
  leaseToken: uuid,
  attemptCount: z.coerce.number().int().positive(),
  customerIdentityId: uuid,
  sourceOrderId: uuid,
  operationKey: uuid,
  createAttemptedAt: z.string().datetime({ offset: true }).nullable(),
  customerKind: z.enum(["PERSON", "LEGAL_ENTITY"]),
  displayName: z.string().trim().min(2).max(160),
  verifiedPhone: z.string().regex(/^\+373\d{8}$/),
  email: z.string().email().nullable(),
  existingExternalId: uuid.nullable(),
}).strict();

export class SupabaseExternalCustomerProvisioningRepository implements ExternalCustomerProvisioningRepository {
  async claim(limit: number) {
    const { data, error } = await createAdminClient().rpc("claim_customer_external_provisioning_jobs_v1", { p_limit: limit });
    if (error) throw codeError(error.code ?? "EXTERNAL_JOB_CLAIM_FAILED");
    return z.array(claimSchema).max(10).parse(data ?? []);
  }

  async markCreateAttempted(job: Parameters<ExternalCustomerProvisioningRepository["markCreateAttempted"]>[0]) {
    const { data, error } = await createAdminClient().rpc("mark_customer_external_create_attempted_v1", {
      p_job_id: job.jobId, p_lease_token: job.leaseToken,
    });
    if (error) throw codeError(error.code ?? "EXTERNAL_CREATE_MARKER_FAILED");
    return data === true;
  }

  async complete(job: Parameters<ExternalCustomerProvisioningRepository["complete"]>[0], input: Parameters<ExternalCustomerProvisioningRepository["complete"]>[1]) {
    const { data, error } = await createAdminClient().rpc("complete_customer_external_provisioning_v1", {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
      p_outcome: input.outcome,
      p_external_id: input.externalId,
      p_candidate_count: input.candidateCount,
      p_provider_request_count: input.providerRequestCount,
      p_provider_duration_ms: input.providerDurationMs,
    });
    if (error) throw codeError(error.code ?? "EXTERNAL_JOB_COMPLETION_FAILED");
    return z.enum(["MATCHED", "NEW", "CONFLICT"]).parse(data);
  }

  async review(job: Parameters<ExternalCustomerProvisioningRepository["review"]>[0], input: Parameters<ExternalCustomerProvisioningRepository["review"]>[1]) {
    const { data, error } = await createAdminClient().rpc("review_customer_external_provisioning_v1", {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
      p_state: input.state,
      p_safe_error_code: input.safeErrorCode,
      p_candidate_count: input.candidateCount,
      p_provider_request_count: input.providerRequestCount,
      p_provider_duration_ms: input.providerDurationMs,
    });
    if (error) throw codeError(error.code ?? "EXTERNAL_JOB_REVIEW_FAILED");
    return data === true;
  }

  async fail(job: Parameters<ExternalCustomerProvisioningRepository["fail"]>[0], input: Parameters<ExternalCustomerProvisioningRepository["fail"]>[1]) {
    const { data, error } = await createAdminClient().rpc("fail_customer_external_provisioning_v1", {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
      p_safe_error_code: input.safeErrorCode,
      p_provider_request_count: input.providerRequestCount,
      p_provider_duration_ms: input.providerDurationMs,
    });
    if (error) throw codeError(error.code ?? "EXTERNAL_JOB_FAILURE_FAILED");
    return data === true;
  }
}

function codeError(code: string) {
  return Object.assign(new Error("External customer provisioning persistence failed."), { code });
}
