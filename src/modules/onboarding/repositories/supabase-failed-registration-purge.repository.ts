import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  FailedRegistrationAuthAdminGateway,
  FailedRegistrationPurgeIdentity,
  FailedRegistrationPurgeRepository,
  PurgeFailedRegistrationLocalInput,
} from "./failed-registration-purge.repository";

const countsSchema = z.record(z.string(), z.number().int().nonnegative());
const blockerSchema = z.object({
  code: z.string(),
  count: z.number().int().nonnegative(),
  relation: z.string().optional(),
  column: z.string().optional(),
});
const readinessSchema = z.object({
  eligible: z.boolean(),
  state: z.enum([
    "ready",
    "blocked",
    "not_found",
    "local_purged",
    "auth_delete_failed",
    "completed",
  ]),
  requestId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  email: z.string().email().nullable(),
  applicationName: z.string().nullable(),
  receiptId: z.string().uuid().nullable(),
  blockers: z.array(blockerSchema),
  counts: countsSchema,
});
const localResultSchema = z.object({
  receiptId: z.string().uuid(),
  status: z.enum(["local_purged", "auth_delete_failed", "completed"]),
  requestId: z.string().uuid(),
  userId: z.string().uuid(),
  deletedCounts: countsSchema,
});
const completionSchema = z.object({
  receiptId: z.string().uuid(),
  status: z.literal("completed"),
  deletedCounts: countsSchema,
  remainingCounts: countsSchema,
});

type AdminClient = ReturnType<typeof createAdminClient>;

export class SupabaseFailedRegistrationPurgeRepository
  implements FailedRegistrationPurgeRepository
{
  constructor(private readonly client: AdminClient = createAdminClient()) {}

  async getReadiness(
    input: { requestId: string } | FailedRegistrationPurgeIdentity,
  ) {
    const exact = "userId" in input ? input : null;
    const { data, error } = await this.client.rpc(
      "get_failed_registration_purge_readiness",
      {
        p_request_id: input.requestId,
        p_user_id: exact?.userId ?? null,
        p_email: exact?.email ?? null,
        p_application_name: exact?.applicationName ?? null,
      },
    );
    if (error) throw persistenceError("PURGE_READINESS_UNAVAILABLE", error);
    return readinessSchema.parse(data);
  }

  async purgeLocal(input: PurgeFailedRegistrationLocalInput) {
    const { data, error } = await this.client.rpc(
      "purge_failed_registration_local",
      {
        p_request_id: input.requestId,
        p_user_id: input.userId,
        p_email: input.email,
        p_application_name: input.applicationName,
        p_actor_user_id: input.actorUserId,
        p_correlation_id: input.correlationId,
      },
    );
    if (error) throw persistenceError("LOCAL_PURGE_FAILED", error);
    return localResultSchema.parse(data);
  }

  async markAuthFailure(receiptId: string, safeErrorCode: string): Promise<void> {
    const { error } = await this.client.rpc(
      "mark_failed_registration_purge_auth_failure",
      {
        p_receipt_id: receiptId,
        p_safe_error_code: safeErrorCode,
      },
    );
    if (error) throw persistenceError("AUTH_FAILURE_RECEIPT_UPDATE_FAILED", error);
  }

  async complete(receiptId: string) {
    const { data, error } = await this.client.rpc(
      "complete_failed_registration_purge",
      { p_receipt_id: receiptId },
    );
    if (error) throw persistenceError("PURGE_FINALIZATION_FAILED", error);
    return completionSchema.parse(data);
  }
}

export class SupabaseFailedRegistrationAuthAdminGateway
  implements FailedRegistrationAuthAdminGateway
{
  constructor(private readonly client: AdminClient = createAdminClient()) {}

  async getUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error) {
      if (isUserNotFound(error)) return null;
      throw authError("AUTH_LOOKUP_FAILED", error);
    }
    return data.user?.email?.trim().toLowerCase() ?? null;
  }

  async deleteUser(userId: string): Promise<"deleted" | "already_missing"> {
    const { error } = await this.client.auth.admin.deleteUser(userId, false);
    if (error) {
      if (isUserNotFound(error)) return "already_missing";
      throw authError("AUTH_DELETE_FAILED", error);
    }
    return "deleted";
  }
}

function persistenceError(code: string, cause: unknown): Error {
  return Object.assign(new Error(code), {
    name: "FailedRegistrationPurgePersistenceError",
    code,
    cause,
  });
}

function authError(code: string, cause: unknown): Error {
  return Object.assign(new Error(code), {
    name: "FailedRegistrationAuthAdminError",
    code,
    cause,
  });
}

function isUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === "user_not_found" || candidate.status === 404;
}
