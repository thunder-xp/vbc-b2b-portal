import { createClient } from "@/src/lib/supabase/server";

import type { RolePermissionRepository } from "../role-permission.repository";
import {
  CompanyStatus,
  MembershipStatus,
  type Permission,
  type Role,
} from "../../types";
import {
  mapPermissionRow,
  mapRoleRow,
  type CompanyMembershipRow,
  type PermissionRow,
  type RolePermissionRow,
  type RoleRow,
} from "./mappers";
import { RepositoryUnexpectedError } from "../index";

const ROLE_COLUMNS = "id, code, name, scope, created_at";
const PERMISSION_COLUMNS = "id, code, description, created_at";
const ROLE_PERMISSION_COLUMNS = "role_id, permission_id, created_at";
const MEMBERSHIP_ROLE_COLUMNS = "role_id";
const PARTNER_COMPANY_ACTIVE_COLUMNS = "id";

export class SupabaseRolePermissionRepository
  implements RolePermissionRepository
{
  async findRoleByCode(code: string): Promise<Role | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("roles")
      .select(ROLE_COLUMNS)
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapRoleRow(data as RoleRow) : null;
  }

  async findPermissionsByRoleId(roleId: string): Promise<Permission[]> {
    const supabase = await createClient();
    const { data: rolePermissionRows, error: rolePermissionError } =
      await supabase
        .from("role_permissions")
        .select(ROLE_PERMISSION_COLUMNS)
        .eq("role_id", roleId);

    if (rolePermissionError) {
      throw new RepositoryUnexpectedError();
    }

    const permissionIds = (rolePermissionRows as RolePermissionRow[]).map(
      (row) => row.permission_id,
    );

    if (permissionIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("permissions")
      .select(PERMISSION_COLUMNS)
      .in("id", permissionIds);

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return (data as PermissionRow[]).map(mapPermissionRow);
  }

  async userHasPermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const supabase = await createClient();
    const { data: membershipData, error: membershipError } = await supabase
      .from("company_memberships")
      .select(MEMBERSHIP_ROLE_COLUMNS)
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("status", MembershipStatus.Active)
      .maybeSingle();

    if (membershipError) {
      throw new RepositoryUnexpectedError();
    }

    if (!membershipData) {
      return false;
    }

    const { data: companyData, error: companyError } = await supabase
      .from("partner_companies")
      .select(PARTNER_COMPANY_ACTIVE_COLUMNS)
      .eq("id", companyId)
      .eq("status", CompanyStatus.Active)
      .maybeSingle();

    if (companyError) {
      throw new RepositoryUnexpectedError();
    }

    if (!companyData) {
      return false;
    }

    const membership = membershipData as Pick<CompanyMembershipRow, "role_id">;
    const { data: permissionData, error: permissionError } = await supabase
      .from("permissions")
      .select(PERMISSION_COLUMNS)
      .eq("code", permissionCode)
      .maybeSingle();

    if (permissionError) {
      throw new RepositoryUnexpectedError();
    }

    if (!permissionData) {
      return false;
    }

    const permission = permissionData as PermissionRow;
    const { data: rolePermissionData, error: rolePermissionError } =
      await supabase
        .from("role_permissions")
        .select(ROLE_PERMISSION_COLUMNS)
        .eq("role_id", membership.role_id)
        .eq("permission_id", permission.id)
        .maybeSingle();

    if (rolePermissionError) {
      throw new RepositoryUnexpectedError();
    }

    return Boolean(rolePermissionData);
  }
}
