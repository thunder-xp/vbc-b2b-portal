export const DEV_MANAGER_EMAIL = "manager@novotech.local";
export const DEV_MANAGER_PASSWORD = "Manager123!";
export const INTERNAL_MANAGER_ROLE_CODE = "internal_manager";
export const CAN_APPROVE_PARTNER_PERMISSION = "CanApprovePartner";

export type BootstrapState = {
  authUserExists: boolean;
  profileExists: boolean;
  profileActiveInternal: boolean;
  roleExists: boolean;
  permissionExists: boolean;
  rolePermissionExists: boolean;
};

export type BootstrapOperation =
  | "create_auth_user"
  | "create_profile"
  | "activate_internal_profile"
  | "create_internal_role"
  | "create_approval_permission"
  | "assign_permission_to_role";

export type BootstrapPlan = {
  operations: BootstrapOperation[];
};

export function planInternalManagerBootstrap(
  state: BootstrapState,
): BootstrapPlan {
  const operations: BootstrapOperation[] = [];

  if (!state.authUserExists) {
    operations.push("create_auth_user");
  }

  if (!state.profileExists) {
    operations.push("create_profile");
  } else if (!state.profileActiveInternal) {
    operations.push("activate_internal_profile");
  }

  if (!state.roleExists) {
    operations.push("create_internal_role");
  }

  if (!state.permissionExists) {
    operations.push("create_approval_permission");
  }

  if (!state.rolePermissionExists) {
    operations.push("assign_permission_to_role");
  }

  return { operations };
}
