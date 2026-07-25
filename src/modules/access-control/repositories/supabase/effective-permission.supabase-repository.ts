import { createClient } from "@/src/lib/supabase/server";

import type { EffectivePermissionContext } from "../../types";
import type { EffectivePermissionRepository } from "../effective-permission.repository";
import { RepositoryUnexpectedError } from "../index";

type EffectivePermissionRow = {
  user_id: string;
  company_id: string;
  profile_status: string;
  company_status: string;
  membership_id: string | null;
  membership_status: string | null;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
  is_internal_override: boolean;
  role_permission_codes: string[] | null;
  allowed_override_codes: string[] | null;
  denied_override_codes: string[] | null;
  effective_permission_codes: string[] | null;
};

export class SupabaseEffectivePermissionRepository
  implements EffectivePermissionRepository
{
  async findForCurrentUser(
    userId: string,
    companyId: string,
  ): Promise<EffectivePermissionContext | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_effective_company_permissions",
      { p_company_id: companyId },
    );

    if (error) {
      throw new RepositoryUnexpectedError({
        operation: "get_effective_company_permissions",
        table: "membership_permission_overrides",
        payloadKeys: ["p_company_id"],
        cause: error,
      });
    }

    const row = (data as EffectivePermissionRow[] | null)?.[0] ?? null;
    if (!row || row.user_id !== userId || row.company_id !== companyId) {
      return null;
    }

    return {
      userId: row.user_id,
      companyId: row.company_id,
      profileStatus: row.profile_status,
      companyStatus: row.company_status,
      membershipId: row.membership_id,
      membershipStatus: row.membership_status,
      roleId: row.role_id,
      roleCode: row.role_code,
      roleName: row.role_name,
      isInternalOverride: row.is_internal_override,
      rolePermissionCodes: row.role_permission_codes ?? [],
      allowedOverrideCodes: row.allowed_override_codes ?? [],
      deniedOverrideCodes: row.denied_override_codes ?? [],
      effectivePermissionCodes: row.effective_permission_codes ?? [],
    };
  }
}
