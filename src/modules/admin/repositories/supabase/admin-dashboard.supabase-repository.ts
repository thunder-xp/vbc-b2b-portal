import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type {
  AdminDashboardProjection,
  AdminDashboardRepository,
} from "../admin-dashboard.repository";

export class SupabaseAdminDashboardRepository
  implements AdminDashboardRepository
{
  async getDashboardProjection(now: string): Promise<AdminDashboardProjection> {
    return this.call<AdminDashboardProjection>("get_admin_dashboard_projection", {
      p_now: now,
    });
  }

  private async call<T>(
    operation: string,
    input?: Record<string, unknown>,
  ): Promise<T> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(operation, input);
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation,
        table: "admin_dashboard_projection",
        payloadKeys: Object.keys(input ?? {}),
        cause: error,
      });
    }
    return data as T;
  }
}
