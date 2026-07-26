import type { CompanyUserManagementRepository } from "../repositories";
import type {
  CompanyInvitationAcceptance,
  CompanyUserEvent,
  CompanyUserPage,
  CompanyUserPriceAccess,
  ManageableCompany,
} from "../types";
import type { CompanyInvitationEmailProvider } from "./company-invitation-email.provider";
import { AccessControlError, InvalidStateError } from "./errors";
import type { PermissionService } from "./permission.service";
import { generateInvitationToken, hashInvitationToken } from "./invitation-token.service";

const MANAGEMENT_PERMISSION = "company_users.manage";
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ASSIGNABLE_ROLES = new Set([
  "partner_manager",
  "partner_buyer",
  "partner_accounting",
  "partner_viewer",
]);
const MUTABLE_ROLES = new Set([...ASSIGNABLE_ROLES, "partner_owner"]);

export type CreateEmployeeInvitationInput = {
  actorUserId: string;
  companyId: string;
  companyName: string;
  inviterName: string;
  fullName: string;
  email: string;
  roleCode: string;
  priceAccess: CompanyUserPriceAccess;
  requestKey: string;
  applicationUrl: string;
};

export type InvitationLinkResult = {
  invitationId: string;
  invitationUrl: string;
  expiresAt: string;
  delivery: "email_sent" | "copy_link" | "already_created";
  repeated: boolean;
};

export class CompanyUserManagementService {
  constructor(
    private readonly repository: CompanyUserManagementRepository,
    private readonly permissionService: PermissionService,
    private readonly emailProvider: CompanyInvitationEmailProvider,
  ) {}

  async list(actorUserId: string, companyId: string, page = 1, pageSize = 25): Promise<CompanyUserPage> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    return this.repository.list(companyId, page, pageSize);
  }

  async listEvents(actorUserId: string, companyId: string): Promise<CompanyUserEvent[]> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    return this.repository.listEvents(companyId, 50);
  }

  listAdminCompanies(search?: string): Promise<ManageableCompany[]> {
    return this.repository.listAdminCompanies(search);
  }

  async createInvitation(input: CreateEmployeeInvitationInput): Promise<InvitationLinkResult> {
    await this.permissionService.ensurePermission(input.actorUserId, input.companyId, MANAGEMENT_PERMISSION);
    validateAssignableRole(input.roleCode);
    const email = normalizeEmail(input.email);
    const fullName = requiredText(input.fullName, "Employee name is required.");
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
    const invitation = await this.repository.createInvitation({
      companyId: input.companyId,
      fullName,
      email,
      roleCode: input.roleCode,
      priceAccess: input.priceAccess,
      tokenHash: token.hash,
      expiresAt,
      requestKey: input.requestKey,
    });
    if (invitation.repeated) {
      return {
        invitationId: invitation.invitationId,
        invitationUrl: "",
        expiresAt: invitation.expiresAt,
        delivery: "already_created",
        repeated: true,
      };
    }
    const invitationUrl = buildInvitationUrl(input.applicationUrl, token.plaintext);
    const delivery = await this.deliver({
      to: email,
      employeeName: fullName,
      companyName: input.companyName,
      inviterName: input.inviterName,
      invitationUrl,
      expiresAt: invitation.expiresAt,
    });
    return {
      invitationId: invitation.invitationId,
      invitationUrl,
      expiresAt: invitation.expiresAt,
      delivery,
      repeated: invitation.repeated,
    };
  }

  async reissueInvitation(input: Omit<CreateEmployeeInvitationInput, "fullName" | "email" | "roleCode" | "priceAccess" | "requestKey"> & {
    invitationId: string;
  }): Promise<InvitationLinkResult> {
    await this.permissionService.ensurePermission(input.actorUserId, input.companyId, MANAGEMENT_PERMISSION);
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
    const invitation = await this.repository.reissueInvitation(input.invitationId, token.hash, expiresAt);
    const invitationUrl = buildInvitationUrl(input.applicationUrl, token.plaintext);
    const delivery = await this.deliver({
      to: invitation.email,
      employeeName: invitation.fullName,
      companyName: input.companyName,
      inviterName: input.inviterName,
      invitationUrl,
      expiresAt: invitation.expiresAt,
    });
    return { invitationId: invitation.invitationId, invitationUrl, expiresAt: invitation.expiresAt, delivery, repeated: false };
  }

  async revokeInvitation(actorUserId: string, companyId: string, invitationId: string, reason: string): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    await this.repository.revokeInvitation(invitationId, normalizeReason(reason));
  }

  acceptInvitation(token: string): Promise<CompanyInvitationAcceptance> {
    if (!token || token.length > 256) throw new InvalidStateError("Invitation token is invalid.");
    return this.repository.acceptInvitation(hashInvitationToken(token));
  }

  async suspend(actorUserId: string, companyId: string, membershipId: string, reason: string): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    await this.repository.setMembershipState(membershipId, "suspended", normalizeReason(reason));
  }

  async restore(actorUserId: string, companyId: string, membershipId: string, reason: string): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    await this.repository.setMembershipState(membershipId, "active", normalizeReason(reason));
  }

  async updateAccess(actorUserId: string, companyId: string, membershipId: string, roleCode: string, priceAccess: CompanyUserPriceAccess, reason: string): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    validateMutableRole(roleCode);
    await this.repository.updateMembershipAccess(membershipId, roleCode, priceAccess, normalizeReason(reason));
  }

  async appointOwner(actorUserId: string, companyId: string, membershipId: string, reason: string): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    await this.repository.appointOwner(membershipId, normalizeReason(reason));
  }

  async transferOwner(
    actorUserId: string,
    companyId: string,
    currentOwnerMembershipId: string,
    nextOwnerMembershipId: string,
    reason: string,
  ): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    await this.repository.transferOwner(
      currentOwnerMembershipId,
      nextOwnerMembershipId,
      normalizeReason(reason),
    );
  }

  async setPermissionOverride(
    actorUserId: string,
    companyId: string,
    membershipId: string,
    permissionCode: string,
    effect: "allow" | "deny" | "inherit",
    reason: string,
  ): Promise<void> {
    await this.permissionService.ensurePermission(actorUserId, companyId, MANAGEMENT_PERMISSION);
    if (!permissionCode.trim() || !["allow", "deny", "inherit"].includes(effect)) {
      throw new InvalidStateError("Permission override is invalid.");
    }
    await this.repository.setPermissionOverride(
      membershipId,
      permissionCode.trim(),
      effect,
      normalizeReason(reason),
    );
  }

  private async deliver(message: Parameters<CompanyInvitationEmailProvider["send"]>[0]): Promise<"email_sent" | "copy_link"> {
    try {
      await this.emailProvider.send(message);
      return "email_sent";
    } catch (error) {
      console.error({
        event: "company_invitation_email_failed",
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return "copy_link";
    }
  }
}

function validateAssignableRole(roleCode: string): void {
  if (!ASSIGNABLE_ROLES.has(roleCode)) {
    throw new InvalidStateError("Partner role is not assignable.");
  }
}

function validateMutableRole(roleCode: string): void {
  if (!MUTABLE_ROLES.has(roleCode)) {
    throw new InvalidStateError("Partner role is not assignable.");
  }
}

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new InvalidStateError("A reason between 3 and 500 characters is required.");
  }
  return reason;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new InvalidStateError("Employee email is invalid.");
  }
  return email;
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new InvalidStateError(message);
  return normalized;
}

function buildInvitationUrl(applicationUrl: string, token: string): string {
  let origin: URL;
  try {
    origin = new URL(applicationUrl);
  } catch {
    throw new AccessControlError("Application URL is invalid.");
  }
  if (!["https:", "http:"].includes(origin.protocol)) {
    throw new AccessControlError("Application URL is invalid.");
  }
  return new URL(`/auth/invitations/${encodeURIComponent(token)}`, origin).toString();
}
