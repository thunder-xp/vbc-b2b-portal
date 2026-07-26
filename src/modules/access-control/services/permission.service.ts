import type { EffectivePermissionContext, Permission, Role } from "../types";
import type { ActiveCompanyContext } from "./company-access.service";

export interface PermissionCheckResult {
  isAllowed: boolean;
  permissionCode: string;
  context: ActiveCompanyContext | null;
}

export interface PermissionService {
  getRole(roleId: string): Promise<Role | null>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  getEffectivePermissionContext(
    userId: string,
    companyId: string,
  ): Promise<EffectivePermissionContext>;
  hasPermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<boolean>;
  ensurePermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<PermissionCheckResult>;
}

export type CommercialVisibilityMode =
  | "full"
  | "retail_only"
  | "hidden";

export type CommercialVisibilityContext = {
  userId: string;
  companyId: string;
  mode: CommercialVisibilityMode;
  canViewPartnerPrice: boolean;
  canViewRetailPrice: boolean;
  canViewMargin: boolean;
  canViewPartnerTotals: boolean;
  canUseCommercialCalculations: boolean;
};

export function resolveCommercialVisibility(
  context: EffectivePermissionContext,
): CommercialVisibilityContext {
  const permissions = new Set(context.effectivePermissionCodes);
  const canViewPartnerPrice = permissions.has("pricing.partner_price.view");
  const canViewRetailPrice = permissions.has("pricing.retail_price.view");

  return Object.freeze({
    userId: context.userId,
    companyId: context.companyId,
    mode: canViewPartnerPrice
      ? "full"
      : canViewRetailPrice
        ? "retail_only"
        : "hidden",
    canViewPartnerPrice,
    canViewRetailPrice,
    canViewMargin: canViewPartnerPrice,
    canViewPartnerTotals: canViewPartnerPrice,
    canUseCommercialCalculations: canViewPartnerPrice,
  });
}
