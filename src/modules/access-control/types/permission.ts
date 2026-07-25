export interface Permission {
  id: string;
  code: string;
  description: string | null;
  scope?: PermissionScope;
  delegableByPartnerOwner?: boolean;
  sensitive?: boolean;
  category?: string;
  createdAt: string;
}

export enum PermissionScope {
  Partner = "partner",
  Internal = "internal",
  Both = "both",
}

export enum PermissionOverrideEffect {
  Allow = "allow",
  Deny = "deny",
}

export interface MembershipPermissionOverride {
  id: string;
  membershipId: string;
  permissionId: string;
  effect: PermissionOverrideEffect;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EffectivePermissionContext {
  userId: string;
  companyId: string;
  profileStatus: string;
  companyStatus: string;
  membershipId: string | null;
  membershipStatus: string | null;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  isInternalOverride: boolean;
  rolePermissionCodes: readonly string[];
  allowedOverrideCodes: readonly string[];
  deniedOverrideCodes: readonly string[];
  effectivePermissionCodes: readonly string[];
}
