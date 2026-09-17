import "server-only";

import { InvalidStateError } from "@/src/modules/access-control/services";

import type {
  AdminInternalUserProvisioningRepository,
  InternalUserProvisioningState,
} from "../repositories";
import { SupabaseAdminInternalUserProvisioningRepository } from "../repositories";
import {
  InternalUserInvitationProviderError,
  SupabaseInternalUserInvitationProvider,
  type InternalUserInvitationProvider,
} from "./internal-user-invitation.provider";

export type InviteFinanceOperatorResult = {
  requestId: string;
  authUserId: string | null;
  invited: boolean;
};

export class AdminInternalUserProvisioningService {
  constructor(
    private readonly repository: AdminInternalUserProvisioningRepository,
    private readonly invitationProvider: InternalUserInvitationProvider,
  ) {}

  async invite(email: string, displayName: string, reason: string): Promise<InviteFinanceOperatorResult> {
    const normalizedEmail = requiredEmail(email);
    const normalizedName = requiredDisplayName(displayName);
    const normalizedReason = requiredReason(reason);
    const existing = await this.repository.getReissueCandidate(normalizedEmail);
    if (existing?.status === "active") {
      return { requestId: existing.requestId, authUserId: existing.authUserId, invited: false };
    }
    if (existing?.status === "invited") {
      try {
        await this.invitationProvider.reissue(
          existing.email,
          existing.authUserId,
          existing.emailConfirmed,
        );
        await this.repository.markReissued(existing.requestId);
        return { requestId: existing.requestId, authUserId: existing.authUserId, invited: true };
      } catch {
        throw new InvalidStateError("Internal finance invitation could not be reissued.");
      }
    }
    const begun = await this.repository.begin(normalizedEmail, normalizedName, normalizedReason);
    if (!begun.newlyCreated) {
      return { requestId: begun.requestId, authUserId: null, invited: false };
    }

    let authUserId: string | null = null;
    try {
      const invitation = await this.invitationProvider.invite(normalizedEmail, normalizedName);
      authUserId = invitation.authUserId;
      await this.repository.markInvited(begun.requestId, invitation.authUserId);
      return { requestId: begun.requestId, authUserId: invitation.authUserId, invited: true };
    } catch (error) {
      const safeCode = error instanceof InternalUserInvitationProviderError
        ? error.safeCode
        : "PROVISIONING_FINALIZATION_FAILED";
      if (authUserId) {
        try {
          await this.invitationProvider.remove(authUserId);
        } catch {
          await safeFail(this.repository, begun.requestId, "AUTH_CLEANUP_FAILED");
          throw new InvalidStateError("Internal invitation cleanup failed.");
        }
      }
      await safeFail(this.repository, begun.requestId, safeCode);
      throw new InvalidStateError("Internal finance invitation could not be completed.");
    }
  }

  activateCurrent(): Promise<string> {
    return this.repository.activateCurrent();
  }

  getCurrent(): Promise<InternalUserProvisioningState | null> {
    return this.repository.getCurrent();
  }
}

async function safeFail(
  repository: AdminInternalUserProvisioningRepository,
  requestId: string,
  safeCode: string,
): Promise<void> {
  try {
    await repository.markFailed(requestId, safeCode);
  } catch {
    // Preserve the original bounded provider error; the request remains non-active.
  }
}

function requiredEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(normalized)) {
    throw new InvalidStateError("A valid internal email is required.");
  }
  return normalized;
}

function requiredDisplayName(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 160) {
    throw new InvalidStateError("An internal display name between 2 and 160 characters is required.");
  }
  return normalized;
}

function requiredReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 500) {
    throw new InvalidStateError("A reason between 3 and 500 characters is required.");
  }
  return normalized;
}

const service = new AdminInternalUserProvisioningService(
  new SupabaseAdminInternalUserProvisioningRepository(),
  new SupabaseInternalUserInvitationProvider(),
);

export function createAdminInternalUserProvisioningService(): AdminInternalUserProvisioningService {
  return service;
}
