import "server-only";

import { InvalidStateError } from "@/src/modules/access-control/services";

import type { AdminRoleManagementRepository } from "../repositories";
import { SupabaseAdminRoleManagementRepository } from "../repositories";

export const ASSIGNABLE_INTERNAL_ROLES = [
  "novotech_admin",
  "novotech_sales",
  "novotech_finance",
  "novotech_support",
  "novotech_content_manager",
] as const;

export type AssignableInternalRole =
  (typeof ASSIGNABLE_INTERNAL_ROLES)[number];

export class AdminRoleManagementService {
  constructor(private readonly repository: AdminRoleManagementRepository) {}

  assign(userId: string, roleCode: string, reason: string): Promise<void> {
    return this.repository.assign(
      requiredUuid(userId),
      internalRole(roleCode),
      requiredReason(reason),
    );
  }

  revoke(userId: string, reason: string): Promise<void> {
    return this.repository.revoke(requiredUuid(userId), requiredReason(reason));
  }

  grantOnboardingCapability(userId: string, reason: string): Promise<void> {
    return this.repository.grantOnboardingCapability(requiredUuid(userId), requiredReason(reason));
  }

  revokeOnboardingCapability(userId: string, reason: string): Promise<void> {
    return this.repository.revokeOnboardingCapability(requiredUuid(userId), requiredReason(reason));
  }
}

function requiredUuid(value: string): string {
  const normalized = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new InvalidStateError("Internal user identity is invalid.");
  }
  return normalized;
}

function internalRole(value: string): AssignableInternalRole {
  if (!ASSIGNABLE_INTERNAL_ROLES.includes(value as AssignableInternalRole)) {
    throw new InvalidStateError("Internal role is not assignable.");
  }
  return value as AssignableInternalRole;
}

function requiredReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 500) {
    throw new InvalidStateError(
      "A reason between 3 and 500 characters is required.",
    );
  }
  return normalized;
}

const service = new AdminRoleManagementService(
  new SupabaseAdminRoleManagementRepository(),
);

export function createAdminRoleManagementService(): AdminRoleManagementService {
  return service;
}
