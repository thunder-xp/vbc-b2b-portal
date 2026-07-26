import "server-only";

import type {
  AdminDashboardRepository,
  AdminPlatformHealthProjection,
} from "../repositories";
import { SupabaseAdminDashboardRepository } from "../repositories";
import type {
  AdminDashboard,
  AdminFreshnessItem,
  AdminHealthStatus,
} from "../types";

const LABELS = {
  catalog: "Каталог",
  prices: "Цены",
  stock: "Остатки",
  arrivals: "Поступления",
  rates: "Курсы",
} as const;

const MAX_AGE_MS = {
  catalog: 36 * 60 * 60 * 1000,
  prices: 36 * 60 * 60 * 1000,
  stock: 36 * 60 * 60 * 1000,
  arrivals: 7 * 24 * 60 * 60 * 1000,
  rates: 7 * 24 * 60 * 60 * 1000,
} as const;

export class AdminDashboardService {
  constructor(private readonly repository: AdminDashboardRepository) {}

  async getDashboard(now = new Date()): Promise<AdminDashboard> {
    const [health, operational, recentEvents] = await Promise.all([
      this.repository.getPlatformHealth(),
      this.repository.getOperationalSummary(),
      this.repository.listRecentEvents(20),
    ]);
    const freshness = (
      Object.keys(LABELS) as Array<keyof typeof LABELS>
    ).map((key) => this.toFreshness(key, health, now));
    const criticalCount =
      freshness.filter((item) => item.status === "failed").length +
      operational.queues.failedOrderExports +
      operational.finance.failedSyncs +
      operational.finance.missingMappings;

    return {
      freshness,
      partnerAccess: operational.partnerAccess,
      queues: operational.queues,
      finance: operational.finance,
      recentEvents: recentEvents.map((event) => ({
        domain: event.domain,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        subject: event.subject,
      })),
      criticalCount,
    };
  }

  private toFreshness(
    key: keyof typeof LABELS,
    health: AdminPlatformHealthProjection,
    now: Date,
  ): AdminFreshnessItem {
    const source = health[key];
    let status: AdminHealthStatus;

    if (!source || source.status === "never_run") {
      status = "never_run";
    } else if (source.status === "failed") {
      status = "failed";
    } else if (["running", "queued"].includes(source.status)) {
      status = "running";
    } else if (
      !source.lastSuccessAt ||
      !Number.isFinite(Date.parse(source.lastSuccessAt))
    ) {
      status = "never_run";
    } else if (
      now.getTime() - Date.parse(source.lastSuccessAt) >
      MAX_AGE_MS[key]
    ) {
      status = "stale";
    } else {
      status = "healthy";
    }

    return {
      key,
      label: LABELS[key],
      status,
      lastSuccessAt: source?.lastSuccessAt ?? null,
    };
  }
}

const dashboardService = new AdminDashboardService(
  new SupabaseAdminDashboardRepository(),
);

export function createAdminDashboardService(): AdminDashboardService {
  return dashboardService;
}
