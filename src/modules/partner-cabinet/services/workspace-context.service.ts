import type {
  AccessRequestService,
  CompanyAccessService,
  PermissionService,
  UserProfileService,
} from "../../access-control/services";
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
} from "../../access-control/services";
import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
  UserType,
} from "../../access-control/types";
import { cache } from "react";
import {
  resolveWorkspaceCapabilities,
  type WorkspaceCapabilityModel,
} from "./workspace-capability.service";

export type PartnerWorkspaceAccessState =
  | "active"
  | "missing_profile"
  | "pending_approval"
  | "rejected"
  | "suspended"
  | "missing_membership"
  | "missing_company"
  | "missing_price_type"
  | "internal";

export type PartnerWorkspaceContext = {
  userId: string;
  userDisplayName: string;
  userEmail: string;
  profileStatus: string | null;
  accessState: PartnerWorkspaceAccessState;
  companyId: string | null;
  companyName: string | null;
  companyStatus: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  membershipRole: string | null;
  external1cCode: string | null;
  external1cPriceTypeId: string | null;
  priceTypeName: string | null;
  capabilities: WorkspaceCapabilityModel;
};

export interface PartnerWorkspaceContextService {
  getWorkspaceContext(userId: string): Promise<PartnerWorkspaceContext>;
}

export interface PartnerPriceTypeReadModel {
  findName(externalReference: string): Promise<string | null>;
}

export class DefaultPartnerWorkspaceContextService
  implements PartnerWorkspaceContextService
{
  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly accessRequestService: AccessRequestService,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly priceTypeReadModel: PartnerPriceTypeReadModel,
  ) {}

  private readonly resolveWorkspaceContext = cache((userId: string) =>
    this.loadWorkspaceContext(userId),
  );

  async getWorkspaceContext(userId: string): Promise<PartnerWorkspaceContext> {
    return this.resolveWorkspaceContext(userId);
  }

  private async loadWorkspaceContext(userId: string): Promise<PartnerWorkspaceContext> {
    const profile = await this.userProfileService.getCurrentProfile(userId);

    if (!profile) return emptyContext(userId, "", "", "missing_profile");

    const displayName = profile.fullName ?? profile.email;
    if (profile.userType === UserType.Internal || profile.userType === UserType.Admin) {
      return emptyContext(profile.id, displayName, profile.email, "internal", profile.status);
    }
    if (profile.status === UserStatus.Rejected) {
      return emptyContext(profile.id, displayName, profile.email, "rejected", profile.status);
    }
    if (profile.status === UserStatus.PendingApproval || profile.status === UserStatus.Registered) {
      return emptyContext(profile.id, displayName, profile.email, "pending_approval", profile.status);
    }
    if (profile.status === UserStatus.Suspended || profile.status === UserStatus.Revoked) {
      return emptyContext(profile.id, displayName, profile.email, "suspended", profile.status);
    }

    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active) ?? memberships[0];

    if (!membership) {
      const requests = await this.accessRequestService.getOwnAccessRequests(userId);
      const pendingRequest = requests.some((request) => request.status === AccessRequestStatus.PendingReview);
      const rejectedRequest = requests.some((request) => request.status === AccessRequestStatus.Rejected);
      return emptyContext(
        profile.id,
        displayName,
        profile.email,
        pendingRequest ? "pending_approval" : rejectedRequest ? "rejected" : "missing_membership",
        profile.status,
      );
    }

    if (membership.status !== MembershipStatus.Active) {
      return {
        ...emptyContext(profile.id, displayName, profile.email, "suspended", profile.status),
        membershipId: membership.id,
        membershipStatus: membership.status,
      };
    }

    let activeContext;
    try {
      activeContext = await this.companyAccessService.getActiveCompanyContext(userId, membership.companyId);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof InvalidStateError) {
        return {
          ...emptyContext(profile.id, displayName, profile.email, "suspended", profile.status),
          membershipId: membership.id,
        };
      }
      if (!(error instanceof NotFoundError)) throw error;
      return {
        ...emptyContext(profile.id, displayName, profile.email, "missing_company", profile.status),
        membershipId: membership.id,
      };
    }

    const [role, permissions] = await Promise.all([
      this.permissionService.getRole(membership.roleId),
      this.permissionService.getRolePermissions(membership.roleId),
    ]);
    const priceTypeReference = activeContext.company.external1cPriceTypeId ?? null;
    const priceTypeName = await this.resolvePriceTypeName(priceTypeReference);
    const accessState: PartnerWorkspaceAccessState = priceTypeReference ? "active" : "missing_price_type";

    return {
      userId: profile.id,
      userDisplayName: displayName,
      userEmail: profile.email,
      profileStatus: profile.status,
      accessState,
      companyId: activeContext.company.id,
      companyName: activeContext.company.displayName,
      companyStatus: activeContext.company.status,
      membershipId: membership.id,
      membershipStatus: membership.status,
      membershipRole: role?.name ?? "Партнёр",
      external1cCode: activeContext.company.external1cCode ?? null,
      external1cPriceTypeId: priceTypeReference,
      priceTypeName,
      capabilities: resolveWorkspaceCapabilities(
        new Set(permissions.map((permission) => permission.code)),
      ),
    };
  }

  private async resolvePriceTypeName(reference: string | null): Promise<string | null> {
    if (!reference) return null;

    try {
      return await this.priceTypeReadModel.findName(reference);
    } catch {
      return null;
    }
  }
}

function emptyContext(
  userId: string,
  userDisplayName: string,
  userEmail: string,
  accessState: PartnerWorkspaceAccessState,
  profileStatus: string | null = null,
): PartnerWorkspaceContext {
  return {
    userId,
    userDisplayName,
    userEmail,
    profileStatus,
    accessState,
    companyId: null,
    companyName: null,
    companyStatus: null,
    membershipId: null,
    membershipStatus: null,
    membershipRole: null,
    external1cCode: null,
    external1cPriceTypeId: null,
    priceTypeName: null,
    capabilities: resolveWorkspaceCapabilities(new Set()),
  };
}
