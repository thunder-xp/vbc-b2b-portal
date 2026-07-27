import "server-only";

import { InvalidStateError } from "@/src/modules/access-control/services";

import type { AdminHistoryRepository } from "../repositories";
import { SupabaseAdminHistoryRepository } from "../repositories";
import type { AdminHistoryPage } from "../types";

export class AdminHistoryService {
  constructor(private readonly repository: AdminHistoryRepository) {}

  listCompany(companyId: string, page?: string | number): Promise<AdminHistoryPage> {
    return this.repository.list({
      companyId: requiredUuid(companyId),
      page: normalizePage(page),
      pageSize: 25,
    });
  }

  listUser(userId: string, page?: string | number): Promise<AdminHistoryPage> {
    return this.repository.list({
      userId: requiredUuid(userId),
      page: normalizePage(page),
      pageSize: 25,
    });
  }

  listGlobal(page?: string | number): Promise<AdminHistoryPage> {
    return this.repository.list({
      page: normalizePage(page),
      pageSize: 25,
    });
  }
}

function normalizePage(value?: string | number): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function requiredUuid(value: string): string {
  const normalized = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new InvalidStateError("Audit context is invalid.");
  }
  return normalized;
}

const service = new AdminHistoryService(new SupabaseAdminHistoryRepository());

export function createAdminHistoryService(): AdminHistoryService {
  return service;
}
