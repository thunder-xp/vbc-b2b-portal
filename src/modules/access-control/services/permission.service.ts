import type { Permission, Role } from "../types";
import type { ActiveCompanyContext } from "./company-access.service";

export interface PermissionCheckResult {
  isAllowed: boolean;
  permissionCode: string;
  context: ActiveCompanyContext | null;
}

export interface PermissionService {
  getRole(roleId: string): Promise<Role | null>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
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
