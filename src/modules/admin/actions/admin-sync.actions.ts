"use server";

import { revalidatePath } from "next/cache";

import {
  failureFromError,
  invalidInput,
  success,
  type ActionResult,
} from "@/src/modules/access-control/actions/action-result";
import { synchronizeEligibleFinanceCompaniesAction } from "@/src/modules/finance/actions";
import {
  runDailyCatalogSyncAction,
  syncAllCommercialDataAction,
  syncExchangeRateFromOneCAction,
  syncPricesFromOneCAction,
  syncStockFromOneCAction,
} from "@/src/modules/integration/actions";
import { createPartnerOrderHistoryAutomationService } from "@/src/modules/orders/actions/service-factory";
import { createProductRelationSyncService } from "@/src/modules/integration/services/product-relation-sync.factory";

import { SupabaseAdminOperationsRepository } from "../repositories";
import { requireAdminPermission } from "../services";
import type { AdminSyncDomain } from "../types";

const DOMAINS = new Set<AdminSyncDomain>([
  "rates",
  "catalog",
  "prices",
  "stock",
  "commercial",
  "active_orders",
  "order_history",
  "finance",
  "product_relations",
]);

export async function runAdminSyncAction(
  domain: string,
  reason: string,
): Promise<ActionResult<null>> {
  const startedAt = Date.now();
  let status: "started" | "completed" | "locked" | "failed" = "failed";
  let normalizedDomain: AdminSyncDomain | null = null;

  try {
    await requireAdminPermission("admin.integrations.manage");
    normalizedDomain = normalizeDomain(domain);
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      return invalidInput("Укажите причину запуска (от 3 до 500 символов).");
    }

    const result = await executeSync(normalizedDomain);
    status = result.success
      ? ["prices", "stock", "commercial"].includes(normalizedDomain)
        ? "started"
        : "completed"
      : result.errorCode === "SYNC_ALREADY_RUNNING"
        ? "locked"
        : "failed";

    await recordAudit(
      normalizedDomain,
      normalizedReason,
      status,
      Date.now() - startedAt,
    );
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/integrations/jobs");

    return result.success
      ? success("Запуск зарегистрирован.", null)
      : {
          success: false,
          errorCode: result.errorCode,
          message: result.message,
          data: null,
        };
  } catch (error) {
    if (normalizedDomain) {
      await recordAudit(
        normalizedDomain,
        reason.trim().slice(0, 500),
        status,
        Date.now() - startedAt,
      ).catch((auditError: unknown) => {
        console.error({
          event: "admin_sync_audit_failed",
          errorType:
            auditError instanceof Error ? auditError.name : typeof auditError,
        });
      });
    }
    return failureFromError(error);
  }
}

function normalizeDomain(value: string): AdminSyncDomain {
  if (!DOMAINS.has(value as AdminSyncDomain)) {
    throw new Error("Unsupported synchronization domain.");
  }
  return value as AdminSyncDomain;
}

async function executeSync(domain: AdminSyncDomain) {
  switch (domain) {
    case "rates":
      return syncExchangeRateFromOneCAction();
    case "catalog":
      return runDailyCatalogSyncAction();
    case "prices":
      return syncPricesFromOneCAction();
    case "stock":
      return syncStockFromOneCAction();
    case "commercial":
      return syncAllCommercialDataAction();
    case "finance":
      return synchronizeEligibleFinanceCompaniesAction();
    case "product_relations": {
      await createProductRelationSyncService().synchronize();
      return success("Связи товаров из 1С опубликованы.", null);
    }
    case "active_orders": {
      await createPartnerOrderHistoryAutomationService().refreshActiveOrders();
      return success("Active order refresh completed.", null);
    }
    case "order_history": {
      await createPartnerOrderHistoryAutomationService().refreshCompanyHistories();
      return success("Order history refresh completed.", null);
    }
  }
}

function recordAudit(
  domain: AdminSyncDomain,
  reason: string,
  resultStatus: "started" | "completed" | "locked" | "failed",
  durationMs: number,
): Promise<string> {
  return new SupabaseAdminOperationsRepository().recordSyncAction({
    domain,
    reason,
    resultStatus,
    runId: null,
    durationMs,
  });
}
