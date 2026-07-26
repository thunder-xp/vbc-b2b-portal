import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminRoleManagementRepository } from "../admin-role-management.repository";

export class SupabaseAdminRoleManagementRepository
  implements AdminRoleManagementRepository
{
  assign(userId: string, roleCode: string, reason: string): Promise<void> {
    return this.call("assign_internal_user_role", {
      p_user_id: userId,
      p_role_code: roleCode,
      p_reason: reason,
    });
  }

  revoke(userId: string, reason: string): Promise<void> {
    return this.call("revoke_internal_user_role", {
      p_user_id: userId,
      p_reason: reason,
    });
  }

  private async call(
    operation: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc(operation, input);
    if (error) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "internal_user_role_assignments",
        payloadKeys: Object.keys(input),
        cause: error,
      });
    }
  }
}
