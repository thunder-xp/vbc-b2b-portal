import { describe, expect, it } from "vitest";

import {
  CAN_APPROVE_PARTNER_PERMISSION,
  DEV_MANAGER_EMAIL,
  DEV_MANAGER_PASSWORD,
  INTERNAL_MANAGER_ROLE_CODE,
  planInternalManagerBootstrap,
} from "../internal-manager-bootstrap";

describe("internal manager development bootstrap", () => {
  it("uses the fixed product demo manager identity", () => {
    expect(DEV_MANAGER_EMAIL).toBe("manager@novotech.local");
    expect(DEV_MANAGER_PASSWORD).toBe("Manager123!");
    expect(INTERNAL_MANAGER_ROLE_CODE).toBe("internal_manager");
    expect(CAN_APPROVE_PARTNER_PERMISSION).toBe("CanApprovePartner");
  });

  it("plans creation when manager records are missing", () => {
    const plan = planInternalManagerBootstrap({
      authUserExists: false,
      profileExists: false,
      profileActiveInternal: false,
      roleExists: false,
      permissionExists: false,
      rolePermissionExists: false,
    });

    expect(plan.operations).toEqual([
      "create_auth_user",
      "create_profile",
      "create_internal_role",
      "create_approval_permission",
      "assign_permission_to_role",
    ]);
  });

  it("plans only profile activation when profile exists but is not active internal", () => {
    const plan = planInternalManagerBootstrap({
      authUserExists: true,
      profileExists: true,
      profileActiveInternal: false,
      roleExists: true,
      permissionExists: true,
      rolePermissionExists: true,
    });

    expect(plan.operations).toEqual(["activate_internal_profile"]);
  });

  it("is idempotent when all records already exist", () => {
    const plan = planInternalManagerBootstrap({
      authUserExists: true,
      profileExists: true,
      profileActiveInternal: true,
      roleExists: true,
      permissionExists: true,
      rolePermissionExists: true,
    });

    expect(plan.operations).toEqual([]);
  });
});
