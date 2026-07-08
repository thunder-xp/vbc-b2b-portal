import type { Permission, Role } from "../types";

export interface RolePermissionRepository {
  findRoleByCode(code: string): Promise<Role | null>;
  findPermissionsByRoleId(roleId: string): Promise<Permission[]>;
  userHasPermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<boolean>;
}
