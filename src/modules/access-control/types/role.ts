export enum RoleScope {
  Partner = "partner",
  Internal = "internal",
  System = "system",
}

export interface Role {
  id: string;
  code: string;
  name: string;
  scope: RoleScope;
  createdAt: string;
}

export interface RolePermission {
  roleId: string;
  permissionId: string;
  createdAt: string;
}
