import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  FailedRegistrationAuthAdminGateway,
  FailedRegistrationPurgeIdentity,
  FailedRegistrationPurgeRepository,
} from "../repositories/failed-registration-purge.repository";
import {
  SupabaseFailedRegistrationAuthAdminGateway,
  SupabaseFailedRegistrationPurgeRepository,
} from "../repositories/supabase-failed-registration-purge.repository";
import type {
  FailedRegistrationPurgeReadiness,
  FailedRegistrationPurgeResult,
} from "../types";

export const FAILED_REGISTRATION_PURGE_PERMISSION =
  "onboarding.failed_registration.purge";

export type FailedRegistrationPurgeErrorCode =
  | "FAILED_REGISTRATION_NOT_FOUND"
  | "FAILED_REGISTRATION_PURGE_BLOCKED"
  | "FAILED_REGISTRATION_IDENTITY_MISMATCH"
  | "AUTH_DELETE_FAILED_LOCAL_PURGED"
  | "AUTH_DELETED_FINALIZATION_PENDING";

export class FailedRegistrationPurgeError extends Error {
  constructor(
    readonly code: FailedRegistrationPurgeErrorCode,
    readonly receiptId: string | null = null,
    readonly blockerCodes: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "FailedRegistrationPurgeError";
  }
}

export class FailedRegistrationPurgeService {
  constructor(
    private readonly repository: FailedRegistrationPurgeRepository,
    private readonly authAdmin: FailedRegistrationAuthAdminGateway,
  ) {}

  getReadiness(requestId: string): Promise<FailedRegistrationPurgeReadiness> {
    return this.repository.getReadiness({ requestId });
  }

  async purge(
    input: FailedRegistrationPurgeIdentity & {
      actorUserId: string;
      correlationId?: string;
    },
  ): Promise<FailedRegistrationPurgeResult> {
    const identity = normalizeIdentity(input);
    const readiness = await this.repository.getReadiness(identity);
    assertReady(readiness, identity);

    const correlationId = input.correlationId ?? randomUUID();
    const local = readiness.state === "ready"
      ? await this.repository.purgeLocal({
          ...identity,
          actorUserId: input.actorUserId,
          correlationId,
        })
      : recoveryLocalResult(readiness);

    let authDeletion: "deleted" | "already_missing";
    try {
      const authEmail = await this.authAdmin.getUserEmail(identity.userId);
      if (authEmail && authEmail !== identity.email) {
        throw Object.assign(new Error("AUTH_IDENTITY_MISMATCH"), {
          code: "AUTH_IDENTITY_MISMATCH",
        });
      }
      authDeletion = authEmail
        ? await this.authAdmin.deleteUser(identity.userId)
        : "already_missing";

      const remainingAuthEmail = await this.authAdmin.getUserEmail(identity.userId);
      if (remainingAuthEmail !== null) {
        throw Object.assign(new Error("AUTH_DELETE_NOT_VERIFIED"), {
          code: "AUTH_DELETE_NOT_VERIFIED",
        });
      }
    } catch (error) {
      const safeErrorCode = safeErrorCodeFrom(error);
      try {
        await this.repository.markAuthFailure(local.receiptId, safeErrorCode);
      } catch (receiptError) {
        console.error({
          event: "failed_registration_purge_recovery_receipt_update_failed",
          receiptId: local.receiptId,
          correlationId,
          safeErrorCode: safeErrorCodeFrom(receiptError),
        });
      }
      throw new FailedRegistrationPurgeError(
        "AUTH_DELETE_FAILED_LOCAL_PURGED",
        local.receiptId,
        [],
        { cause: error },
      );
    }

    try {
      const completion = await this.repository.complete(local.receiptId);
      return {
        ...completion,
        authDeletion,
        idempotent: readiness.state !== "ready" || authDeletion === "already_missing",
      };
    } catch (error) {
      throw new FailedRegistrationPurgeError(
        "AUTH_DELETED_FINALIZATION_PENDING",
        local.receiptId,
        [],
        { cause: error },
      );
    }
  }
}

export function createFailedRegistrationPurgeService(): FailedRegistrationPurgeService {
  const client = createAdminClient();
  return new FailedRegistrationPurgeService(
    new SupabaseFailedRegistrationPurgeRepository(client),
    new SupabaseFailedRegistrationAuthAdminGateway(client),
  );
}

function normalizeIdentity(
  input: FailedRegistrationPurgeIdentity,
): FailedRegistrationPurgeIdentity {
  return {
    requestId: input.requestId,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    applicationName: input.applicationName.trim(),
  };
}

function assertReady(
  readiness: FailedRegistrationPurgeReadiness,
  identity: FailedRegistrationPurgeIdentity,
): void {
  if (readiness.state === "not_found") {
    throw new FailedRegistrationPurgeError("FAILED_REGISTRATION_NOT_FOUND");
  }
  if (!readiness.eligible) {
    const blockerCodes = readiness.blockers.map((blocker) => blocker.code);
    const identityMismatch = blockerCodes.some((code) =>
      [
        "USER_ID_MISMATCH",
        "EMAIL_MISMATCH",
        "APPLICATION_NAME_MISMATCH",
        "AUTH_EMAIL_MISMATCH",
        "EMAIL_OWNERSHIP_CONFLICT",
      ].includes(code),
    );
    throw new FailedRegistrationPurgeError(
      identityMismatch
        ? "FAILED_REGISTRATION_IDENTITY_MISMATCH"
        : "FAILED_REGISTRATION_PURGE_BLOCKED",
      readiness.receiptId,
      blockerCodes,
    );
  }
  if (
    readiness.userId !== identity.userId
    || readiness.email?.trim().toLowerCase() !== identity.email
    || readiness.applicationName?.trim() !== identity.applicationName
  ) {
    throw new FailedRegistrationPurgeError(
      "FAILED_REGISTRATION_IDENTITY_MISMATCH",
      readiness.receiptId,
    );
  }
}

function recoveryLocalResult(readiness: FailedRegistrationPurgeReadiness) {
  if (
    !readiness.receiptId
    || !readiness.userId
    || !["local_purged", "auth_delete_failed", "completed"].includes(readiness.state)
  ) {
    throw new FailedRegistrationPurgeError(
      "FAILED_REGISTRATION_PURGE_BLOCKED",
      readiness.receiptId,
      readiness.blockers.map((blocker) => blocker.code),
    );
  }
  return {
    receiptId: readiness.receiptId,
    status: readiness.state as "local_purged" | "auth_delete_failed" | "completed",
    requestId: readiness.requestId,
    userId: readiness.userId,
    deletedCounts: readiness.counts,
  };
}

function safeErrorCodeFrom(error: unknown): string {
  if (!error || typeof error !== "object") return "AUTH_DELETE_FAILED";
  const raw = (error as { code?: unknown }).code;
  if (typeof raw !== "string") return "AUTH_DELETE_FAILED";
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 80);
  return normalized || "AUTH_DELETE_FAILED";
}
