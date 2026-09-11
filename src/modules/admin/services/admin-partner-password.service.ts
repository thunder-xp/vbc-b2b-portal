import "server-only";

import { passwordPolicyIssue } from "@/src/modules/auth/password-policy";

import {
  AdminPartnerPasswordProviderFailure,
  type AdminPartnerIntegrityRepository,
  type AdminPartnerPasswordRepository,
} from "../repositories";
import {
  SupabaseAdminPartnerIntegrityRepository,
  SupabaseAdminPartnerPasswordRepository,
} from "../repositories";
import type { AdminPartnerUserIntegrity } from "../types";
import type { AdminPartnerPasswordErrorCode } from "../password-change-copy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminPartnerPasswordChangeInput = {
  actorUserId: string;
  targetProfileId: string;
  password: string;
  confirmation: string;
  correlationId: string;
};

export type AdminPartnerPasswordChangeResult = {
  auditEventId: string;
  correlationId: string;
  targetCompanyId: string;
  targetUserId: string;
};

export class AdminPartnerPasswordChangeError extends Error {
  constructor(readonly code: AdminPartnerPasswordErrorCode) {
    super(code);
    this.name = "AdminPartnerPasswordChangeError";
  }
}

export class AdminPartnerPasswordService {
  constructor(
    private readonly targetReader: Pick<AdminPartnerIntegrityRepository, "getUser">,
    private readonly passwordRepository: AdminPartnerPasswordRepository,
  ) {}

  canOfferPasswordChange(detail: AdminPartnerUserIntegrity): boolean {
    return detail.identity.userType === "partner"
      && detail.identity.status === "active"
      && resolveTargetCompanyId(detail) !== null;
  }

  async changePassword(input: AdminPartnerPasswordChangeInput): Promise<AdminPartnerPasswordChangeResult> {
    validateBoundary(input);

    let detail: AdminPartnerUserIntegrity | null;
    try {
      detail = await this.targetReader.getUser(input.targetProfileId);
    } catch {
      throw new AdminPartnerPasswordChangeError("SYSTEM_ERROR");
    }
    if (!detail || detail.identity.id !== input.targetProfileId) {
      throw new AdminPartnerPasswordChangeError("INVALID_TARGET");
    }
    if (detail.identity.userType !== "partner" || detail.identity.status !== "active") {
      throw new AdminPartnerPasswordChangeError("TARGET_NOT_SUPPORTED");
    }
    const targetCompanyId = resolveTargetCompanyId(detail);
    if (!targetCompanyId) throw new AdminPartnerPasswordChangeError("TARGET_COMPANY_AMBIGUOUS");

    let authIdentity;
    try {
      authIdentity = await this.passwordRepository.getAuthIdentity(detail.identity.id);
    } catch {
      throw new AdminPartnerPasswordChangeError("AUTH_PROVIDER_REJECTED");
    }
    if (!authIdentity || authIdentity.id !== detail.identity.id) {
      throw new AdminPartnerPasswordChangeError("AUTH_MAPPING_MISSING");
    }
    if (authIdentity.isAnonymous || !authIdentity.email || !authIdentity.hasEmailIdentity) {
      throw new AdminPartnerPasswordChangeError("TARGET_NOT_SUPPORTED");
    }

    try {
      await this.passwordRepository.changePasswordAndRevokeTargetSessions(authIdentity.id, input.password);
    } catch (error) {
      if (error instanceof AdminPartnerPasswordProviderFailure) {
        throw new AdminPartnerPasswordChangeError("AUTH_PROVIDER_REJECTED");
      }
      throw new AdminPartnerPasswordChangeError("AUTH_PROVIDER_REJECTED");
    }

    let auditEventId: string;
    try {
      auditEventId = await this.passwordRepository.recordPasswordChangeAudit({
        actorUserId: input.actorUserId,
        targetUserId: authIdentity.id,
        targetCompanyId,
        correlationId: input.correlationId,
      });
    } catch {
      throw new AdminPartnerPasswordChangeError("AUDIT_FAILED_AFTER_CHANGE");
    }

    return {
      auditEventId,
      correlationId: input.correlationId,
      targetCompanyId,
      targetUserId: authIdentity.id,
    };
  }
}

function validateBoundary(input: AdminPartnerPasswordChangeInput): void {
  if (!UUID.test(input.actorUserId) || !UUID.test(input.targetProfileId) || !UUID.test(input.correlationId)) {
    throw new AdminPartnerPasswordChangeError("INVALID_TARGET");
  }
  const issue = passwordPolicyIssue(input.password);
  if (issue === "required") throw new AdminPartnerPasswordChangeError("PASSWORD_REQUIRED");
  if (issue) throw new AdminPartnerPasswordChangeError("PASSWORD_POLICY");
  if (input.password !== input.confirmation) {
    throw new AdminPartnerPasswordChangeError("PASSWORD_MISMATCH");
  }
}

function resolveTargetCompanyId(detail: AdminPartnerUserIntegrity): string | null {
  const active = detail.memberships.filter((membership) => (
    membership.status === "active" && membership.companyStatus === "active"
  ));
  const preferred = active.filter((membership) => membership.isDefault);
  if (preferred.length === 1) return preferred[0]!.companyId;
  if (preferred.length === 0 && active.length === 1) return active[0]!.companyId;
  return null;
}

const service = new AdminPartnerPasswordService(
  new SupabaseAdminPartnerIntegrityRepository(),
  new SupabaseAdminPartnerPasswordRepository(),
);

export function createAdminPartnerPasswordService(): AdminPartnerPasswordService {
  return service;
}
