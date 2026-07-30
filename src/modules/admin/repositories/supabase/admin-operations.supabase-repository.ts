import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminOperationsRepository } from "../admin-operations.repository";
import type {
  AdminCommercialSummary,
  AdminRetailHistoryAbsenceFilters,
  AdminRetailHistoryAbsencePage,
  AdminRetailPriceHistoryHealth,
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminOperationalPage,
  AdminSyncJobFilters,
  AdminSyncJobPage,
  AdminSupportPage,
} from "../../types";

export class SupabaseAdminOperationsRepository
  implements AdminOperationsRepository
{
  getIntegrationCenter(): Promise<AdminIntegrationCenter> {
    return this.call("get_admin_integration_center");
  }

  listSyncJobs(input: AdminSyncJobFilters): Promise<AdminSyncJobPage> {
    return this.call("list_admin_sync_jobs", {
      p_domain: input.domain ?? null,
      p_status: input.status ?? null,
      p_trigger: input.trigger ?? null,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_page: input.page ?? 1,
      p_page_size: input.pageSize ?? 25,
    });
  }

  listIncidents(): Promise<readonly AdminIntegrationIncident[]> {
    return this.call("list_admin_integration_incidents");
  }

  recordSyncAction(
    input: Parameters<AdminOperationsRepository["recordSyncAction"]>[0],
  ): Promise<string> {
    return this.call("record_internal_sync_action", {
      p_domain: input.domain,
      p_reason: input.reason,
      p_result_status: input.resultStatus,
      p_run_id: input.runId,
      p_duration_ms: input.durationMs,
    });
  }

  getCommercialSummary(
    domain: "catalog" | "prices" | "stock" | "arrivals",
    search?: string,
  ): Promise<AdminCommercialSummary> {
    return this.call("get_admin_commercial_summary", {
      p_domain: domain,
      p_search: search?.trim() || null,
    });
  }

  getRetailPriceHistoryHealth(): Promise<AdminRetailPriceHistoryHealth> {
    return this.call("get_retail_price_history_health");
  }

  listProductsWithoutRetailHistory(
    input: AdminRetailHistoryAbsenceFilters,
  ): Promise<AdminRetailHistoryAbsencePage> {
    return this.call("list_admin_products_without_retail_history", {
      p_search: input.search ?? null,
      p_category_id: input.categoryId ?? null,
      p_reason: input.reason ?? null,
      p_page: input.page ?? 1,
      p_page_size: input.pageSize ?? 25,
    });
  }

  getOperationalPage(
    view: "orders" | "shipments" | "reservations",
    page: number,
  ): Promise<AdminOperationalPage> {
    return this.call("get_admin_operations_list", {
      p_view: view,
      p_page: page,
      p_page_size: 25,
    });
  }

  getSupportPage(
    view: "estimates" | "finance",
    page: number,
  ): Promise<AdminSupportPage> {
    return this.call("get_admin_support_list", {
      p_view: view,
      p_page: page,
      p_page_size: 25,
    });
  }

  getGovernanceSummary(
    view: "security" | "settings",
  ): Promise<{ metrics: Readonly<Record<string, number>> }> {
    return this.call("get_admin_governance_summary", { p_view: view });
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
        table: "admin_operations_projection",
        payloadKeys: Object.keys(input ?? {}),
        cause: error,
      });
    }
    return data as T;
  }
}
