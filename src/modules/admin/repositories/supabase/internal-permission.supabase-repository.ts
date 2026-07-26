import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { InternalPermissionRepository } from "../internal-permission.repository";
import type { InternalPermissionProjection } from "../../types";

type InternalPermissionRow = {
  user_id: string;
  profile_status: string;
  internal_role_codes: string[] | null;
  effective_permission_codes: string[] | null;
  is_platform_admin: boolean;
  display_name: string;
};

export class SupabaseInternalPermissionRepository
  implements InternalPermissionRepository
{
  async findForCurrentUser(
    userId: string,
  ): Promise<InternalPermissionProjection | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_effective_internal_permissions",
    );

    if (error) {
      throw new RepositoryUnexpectedError({
        operation: "get_effective_internal_permissions",
        table: "internal_user_role_assignments",
        payloadKeys: [],
        cause: error,
      });
    }

    const row = (data as InternalPermissionRow[] | null)?.[0] ?? null;
    if (!row || row.user_id !== userId) return null;

    return {
      userId: row.user_id,
      profileStatus: row.profile_status,
      internalRoleCodes: row.internal_role_codes ?? [],
      effectivePermissionCodes: row.effective_permission_codes ?? [],
      isPlatformAdmin: row.is_platform_admin,
      displayName: row.display_name,
    };
  }
}
