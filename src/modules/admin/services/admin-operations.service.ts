import "server-only";

import type { AdminOperationsRepository } from "../repositories";
import { SupabaseAdminOperationsRepository } from "../repositories";
import type {
  AdminIntegrationCenter,
  AdminIntegrationIncident,
  AdminSyncJobFilters,
  AdminSyncJobPage,
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
