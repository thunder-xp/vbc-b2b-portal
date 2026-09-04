import "server-only";

import type { AdminOperationsRepository } from "../repositories";
import { SupabaseAdminOperationsRepository } from "../repositories";
import type {
  AdminCommercialSummary,
  AdminCommercialIntegrity,
  AdminGovernedPriceCoverage,
  AdminStockReconciliation,
  AdminRetailHistoryAbsenceFilters,
  AdminRetailHistoryAbsencePage,
  AdminRetailPriceHistoryHealth,
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminOperationalPage,
  AdminSyncJobFilters,
  AdminSyncJobPage,
  AdminSupportPage,
} from "../types";

export class AdminOperationsService {
  constructor(private readonly repository: AdminOperationsRepository) {}

  getIntegrationCenter(): Promise<AdminIntegrationCenter> {
    return this.repository.getIntegrationCenter();
  }

  listSyncJobs(input: AdminSyncJobFilters): Promise<AdminSyncJobPage> {
    return this.repository.listSyncJobs({
      domain: cleanToken(input.domain),
      status: cleanToken(input.status),
      trigger: cleanToken(input.trigger),
      from: validDate(input.from),
      to: validDate(input.to),
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  listIncidents(): Promise<readonly AdminIntegrationIncident[]> {
    return this.repository.listIncidents();
  }

  getCommercialSummary(
    domain: "catalog" | "prices" | "stock" | "arrivals",
    search?: string,
  ): Promise<AdminCommercialSummary> {
    return this.repository.getCommercialSummary(domain, search?.slice(0, 100));
  }

  getCommercialIntegrity(): Promise<AdminCommercialIntegrity> {
    return this.repository.getCommercialIntegrity();
  }

  getGovernedPriceCoverage(): Promise<AdminGovernedPriceCoverage> {
    return this.repository.getGovernedPriceCoverage();
  }

  getStockReconciliation(): Promise<AdminStockReconciliation> {
    return this.repository.getStockReconciliation();
  }

  getRetailPriceHistoryHealth(): Promise<AdminRetailPriceHistoryHealth> {
    return this.repository.getRetailPriceHistoryHealth();
  }

  listProductsWithoutRetailHistory(
    input: AdminRetailHistoryAbsenceFilters,
  ): Promise<AdminRetailHistoryAbsencePage> {
    return this.repository.listProductsWithoutRetailHistory({
      search: input.search?.trim().slice(0, 100) || undefined,
      categoryId: validUuid(input.categoryId),
      reason: cleanAbsenceReason(input.reason),
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  getOperationalPage(
    view: "orders" | "shipments" | "reservations",
    page?: number,
  ): Promise<AdminOperationalPage> {
    return this.repository.getOperationalPage(view, positiveInteger(page, 1));
  }

  getSupportPage(
    view: "estimates" | "finance",
    page?: number,
  ): Promise<AdminSupportPage> {
    return this.repository.getSupportPage(view, positiveInteger(page, 1));
  }

  getGovernanceSummary(
    view: "security" | "settings",
  ): Promise<{ metrics: Readonly<Record<string, number>> }> {
    return this.repository.getGovernanceSummary(view);
  }
}

const operationsService = new AdminOperationsService(
  new SupabaseAdminOperationsRepository(),
);

export function createAdminOperationsService(): AdminOperationsService {
  return operationsService;
}

function cleanToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[a-z_]+$/.test(normalized) ? normalized : undefined;
}

function validDate(value: string | undefined): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSENCE_REASONS = new Set([
  "no_retail_register_record",
  "baseline_only_new_product",
  "current_price_without_historical_source",
  "source_record_not_currently_authoritative",
  "unknown_requires_review",
]);

function validUuid(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && UUID.test(normalized) ? normalized : undefined;
}

function cleanAbsenceReason(
  value: AdminRetailHistoryAbsenceFilters["reason"],
): AdminRetailHistoryAbsenceFilters["reason"] {
  return value && ABSENCE_REASONS.has(value) ? value : undefined;
}
