import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminHistoryEvent, AdminHistoryPage } from "../../types";
import type {
  AdminHistoryRepository,
  ListAdminHistoryInput,
} from "../admin-history.repository";

type AdminHistoryRow = {
  event_key: string;
  source_type: string;
  company_id: string | null;
  company_name: string | null;
  target_user_id: string | null;
  target_name: string | null;
  target_email: string | null;
  actor_name: string | null;
  event_type: string;
  reason: string | null;
  safe_detail: string | null;
  created_at: string;
  total_count: number | string;
};

export class SupabaseAdminHistoryRepository
  implements AdminHistoryRepository
{
  async list(input: ListAdminHistoryInput): Promise<AdminHistoryPage> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_admin_context_history", {
      p_company_id: input.companyId ?? null,
      p_user_id: input.userId ?? null,
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    if (error || data === null) {
      throw new RepositoryUnexpectedError({
        operation: "list_admin_context_history",
        table: "admin_context_history",
        payloadKeys: ["p_company_id", "p_user_id", "p_page", "p_page_size"],
        cause: error,
      });
    }
    const rows = data as AdminHistoryRow[];
    const totalCount = Number(rows[0]?.total_count ?? 0);
    return {
      records: rows.map(mapEvent),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    };
  }
}

function mapEvent(row: AdminHistoryRow): AdminHistoryEvent {
  return {
    eventKey: row.event_key,
    sourceType: row.source_type,
    companyId: row.company_id,
    companyName: row.company_name,
    targetUserId: row.target_user_id,
    targetName: row.target_name,
    targetEmail: row.target_email,
    actorName: row.actor_name,
    eventType: row.event_type,
    reason: row.reason,
    safeDetail: row.safe_detail,
    createdAt: row.created_at,
  };
}
