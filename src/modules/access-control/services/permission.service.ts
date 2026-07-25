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
