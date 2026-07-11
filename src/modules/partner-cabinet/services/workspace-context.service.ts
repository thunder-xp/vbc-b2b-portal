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
import type { PartnerLookupService } from "../../integration/services";

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

export type PartnerWorkspaceModule = {
  key: string;
  title: string;
  description: string;
  href: string | null;
  availability: "available" | "coming_soon" | "configuration_required";
};

export type PartnerWorkspaceContext = {
  userId: string;
  userDisplayName: string;
  userEmail: string;
  accessState: PartnerWorkspaceAccessState;
  companyId: string | null;
  companyName: string | null;
  companyStatus: string | null;
  membershipId: string | null;
  membershipRole: string | null;
  external1cId: string | null;
  external1cCode: string | null;
  external1cContractId: string | null;
  external1cPriceTypeId: string | null;
  priceTypeName: string | null;
  availableModules: PartnerWorkspaceModule[];
};

export interface PartnerWorkspaceContextService {
  getWorkspaceContext(userId: string): Promise<PartnerWorkspaceContext>;
}

export class DefaultPartnerWorkspaceContextService
  implements PartnerWorkspaceContextService
{
  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly accessRequestService: AccessRequestService,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly partnerLookupService: PartnerLookupService,
  ) {}

  async getWorkspaceContext(userId: string): Promise<PartnerWorkspaceContext> {
    const profile = await this.userProfileService.getCurrentProfile(userId);

    if (!profile) return emptyContext(userId, "", "", "missing_profile");

    const displayName = profile.fullName ?? profile.email;
    if (profile.userType === UserType.Internal || profile.userType === UserType.Admin) {
      return emptyContext(profile.id, displayName, profile.email, "internal");
    }
    if (profile.status === UserStatus.Rejected) {
      return emptyContext(profile.id, displayName, profile.email, "rejected");
    }
    if (profile.status === UserStatus.PendingApproval || profile.status === UserStatus.Registered) {
      return emptyContext(profile.id, displayName, profile.email, "pending_approval");
    }
    if (profile.status === UserStatus.Suspended || profile.status === UserStatus.Revoked) {
      return emptyContext(profile.id, displayName, profile.email, "suspended");
    }

    const [memberships, requests] = await Promise.all([
      this.companyAccessService.getOwnMemberships(userId),
      this.accessRequestService.getOwnAccessRequests(userId),
    ]);
    const pendingRequest = requests.some((request) => request.status === AccessRequestStatus.PendingReview);
    const rejectedRequest = requests.some((request) => request.status === AccessRequestStatus.Rejected);
    const approvedRequests = requests.filter((request) => request.status === AccessRequestStatus.Approved);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active) ?? memberships[0];

    if (!membership) {
      return emptyContext(
        profile.id,
        displayName,
        profile.email,
        pendingRequest ? "pending_approval" : rejectedRequest ? "rejected" : "missing_membership",
      );
    }

    if (membership.status !== MembershipStatus.Active) {
      return {
        ...emptyContext(profile.id, displayName, profile.email, "suspended"),
        membershipId: membership.id,
      };
    }

    const hasApprovedAccess = approvedRequests.some(
      (request) => request.companyId === membership.companyId,
    );
    if (!hasApprovedAccess) {
      return {
        ...emptyContext(
          profile.id,
          displayName,
          profile.email,
          pendingRequest ? "pending_approval" : rejectedRequest ? "rejected" : "missing_membership",
        ),
        membershipId: membership.id,
      };
    }

    let activeContext;
    try {
      activeContext = await this.companyAccessService.getActiveCompanyContext(userId, membership.companyId);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof InvalidStateError) {
        return {
          ...emptyContext(profile.id, displayName, profile.email, "suspended"),
          membershipId: membership.id,
        };
      }
      if (!(error instanceof NotFoundError)) throw error;
      return {
        ...emptyContext(profile.id, displayName, profile.email, "missing_company"),
        membershipId: membership.id,
      };
    }

    const [role, canViewPrices, canViewStock] = await Promise.all([
      this.permissionService.getRole(membership.roleId),
      this.permissionService.hasPermission(userId, membership.companyId, "prices.view"),
      this.permissionService.hasPermission(userId, membership.companyId, "stock.view"),
    ]);
    const priceTypeReference = activeContext.company.external1cPriceTypeId ?? null;
    const priceTypeName = await this.resolvePriceTypeName(priceTypeReference);
    const accessState: PartnerWorkspaceAccessState = priceTypeReference ? "active" : "missing_price_type";

    return {
      userId: profile.id,
      userDisplayName: displayName,
      userEmail: profile.email,
      accessState,
      companyId: activeContext.company.id,
      companyName: activeContext.company.displayName,
      companyStatus: activeContext.company.status,
      membershipId: membership.id,
      membershipRole: role?.name ?? "Партнёр",
      external1cId: activeContext.company.external1cId,
      external1cCode: activeContext.company.external1cCode ?? null,
      external1cContractId: activeContext.company.external1cContractId ?? null,
      external1cPriceTypeId: priceTypeReference,
      priceTypeName,
      availableModules: workspaceModules(
        Boolean(priceTypeReference),
        canViewPrices || canViewStock,
      ),
    };
  }

  private async resolvePriceTypeName(reference: string | null): Promise<string | null> {
    if (!reference) return null;

    try {
      return (await this.partnerLookupService.getPriceType(reference))?.name ?? "Назначен";
    } catch {
      return "Назначен";
    }
  }
}

function emptyContext(
  userId: string,
  userDisplayName: string,
  userEmail: string,
  accessState: PartnerWorkspaceAccessState,
): PartnerWorkspaceContext {
  return {
    userId,
    userDisplayName,
    userEmail,
    accessState,
    companyId: null,
    companyName: null,
    companyStatus: null,
    membershipId: null,
    membershipRole: null,
    external1cId: null,
    external1cCode: null,
    external1cContractId: null,
    external1cPriceTypeId: null,
    priceTypeName: null,
    availableModules: workspaceModules(false),
  };
}

function workspaceModules(
  hasCommercialConfiguration: boolean,
  hasCommercialPermission = false,
): PartnerWorkspaceModule[] {
  const commercialAvailability = !hasCommercialConfiguration
    ? "configuration_required"
    : hasCommercialPermission
      ? "available"
      : "coming_soon";

  return [
    { key: "catalog", title: "Каталог", description: "Поиск и просмотр оборудования Novotech.", href: "/cabinet/catalog", availability: "available" },
    { key: "pricing_inventory", title: "Цены и остатки", description: "Доступные цены и складская информация в каталоге.", href: commercialAvailability === "available" ? "/cabinet/catalog" : null, availability: commercialAvailability },
    { key: "orders", title: "Заказы", description: "Создание и контроль заказов партнёра.", href: null, availability: "coming_soon" },
    { key: "projects", title: "Проекты", description: "Работа с проектными поставками.", href: null, availability: "coming_soon" },
    { key: "documents", title: "Документы", description: "Коммерческие и продуктовые документы.", href: null, availability: "coming_soon" },
    { key: "finance", title: "Финансы", description: "Разрешённая финансовая информация компании.", href: null, availability: "coming_soon" },
    { key: "service", title: "Сервис и гарантия", description: "Сервисные и гарантийные обращения.", href: null, availability: "coming_soon" },
    { key: "support", title: "Поддержка", description: "Связь с командой Novotech.", href: null, availability: "coming_soon" },
  ];
}
