import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type {
  AdminDashboardRepository,
  AdminOperationalProjection,
  AdminPlatformHealthProjection,
  AdminRecentEventProjection,
} from "../admin-dashboard.repository";

export class SupabaseAdminDashboardRepository
  implements AdminDashboardRepository
{
  async getPlatformHealth(): Promise<AdminPlatformHealthProjection> {
    return this.call<AdminPlatformHealthProjection>(
      "get_admin_platform_health_summary",
    );
  }

  async getOperationalSummary(): Promise<AdminOperationalProjection> {
    return this.call<AdminOperationalProjection>(
      "get_admin_operational_summary",
    );
  }

  async listRecentEvents(
    limit: number,
  ): Promise<readonly AdminRecentEventProjection[]> {
    return this.call<AdminRecentEventProjection[]>("get_admin_recent_events", {
      p_limit: Math.min(Math.max(Math.trunc(limit), 1), 20),
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
