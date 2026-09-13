import "server-only";

import type { AdminDashboardRepository } from "../repositories";
import { SupabaseAdminDashboardRepository } from "../repositories";
import type {
  AdminDashboard,
} from "../types";

const LABELS = {
  catalog: "Каталог",
  prices: "Цены",
  stock: "Остатки",
  arrivals: "Поступления",
  rates: "Курсы",
} as const;

export class AdminDashboardService {
  constructor(private readonly repository: AdminDashboardRepository) {}

  async getDashboard(now = new Date()): Promise<AdminDashboard> {
    const projection = await this.repository.getDashboardProjection(now.toISOString());
    const issuesByDomain = new Map(
      projection.issues.map((issue) => [issue.domain, issue] as const),
    );
    const freshness = projection.health.map((item) => ({
      key: item.key,
      label: LABELS[item.key],
      status: item.status,
      lastAttemptAt: item.lastAttemptAt,
      lastSuccessAt: item.lastSuccessAt,
      href: issuesByDomain.get(item.key)?.detailHref ?? item.historyHref,
    }));

    return {
      freshness,
      partnerAccess: projection.operational.partnerAccess,
      queues: projection.operational.queues,
      finance: projection.operational.finance,
      recentEvents: projection.recentEvents.map((event) => ({
        domain: event.domain,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        subject: event.subject,
      })),
      criticalCount: projection.issues.length,
    };
  }
}

const dashboardService = new AdminDashboardService(
  new SupabaseAdminDashboardRepository(),
);

export function createAdminDashboardService(): AdminDashboardService {
  return dashboardService;
}
