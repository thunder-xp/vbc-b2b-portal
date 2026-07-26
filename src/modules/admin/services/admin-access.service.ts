import "server-only";

import type { AdminAccessRepository } from "../repositories";
import { SupabaseAdminAccessRepository } from "../repositories";
import type {
  AdminAccessInspection,
  AdminAccessSubject,
} from "../types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminAccessService {
  constructor(private readonly repository: AdminAccessRepository) {}

  listSubjects(search?: string): Promise<AdminAccessSubject[]> {
    return this.repository.listSubjects(search?.trim().slice(0, 100) ?? "");
  }

  inspect(
    userId?: string,
    companyId?: string,
  ): Promise<AdminAccessInspection | null> {
    if (!userId || !UUID_PATTERN.test(userId)) return Promise.resolve(null);
    if (companyId && !UUID_PATTERN.test(companyId)) return Promise.resolve(null);
    return this.repository.inspect(userId, companyId ?? null);
  }
}

const service = new AdminAccessService(new SupabaseAdminAccessRepository());

export function createAdminAccessService(): AdminAccessService {
  return service;
}
