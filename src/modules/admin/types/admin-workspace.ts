export type AdminEnvironment = "production" | "preview" | "development";

export interface InternalPermissionProjection {
  userId: string;
  profileStatus: string;
  internalRoleCodes: readonly string[];
  effectivePermissionCodes: readonly string[];
  isPlatformAdmin: boolean;
  displayName: string;
}

export interface AdminNavigationItem {
  label: string;
  href: string;
  permission: string;
}

export interface AdminNavigationGroup {
  label: string;
  items: readonly AdminNavigationItem[];
}

export interface AdminWorkspaceContext {
  userId: string;
  displayName: string;
  roleCodes: readonly string[];
  permissions: readonly string[];
  isPlatformAdmin: boolean;
  navigation: readonly AdminNavigationGroup[];
  environment: AdminEnvironment;
  commitSha: string | null;
  deploymentId: string | null;
}
