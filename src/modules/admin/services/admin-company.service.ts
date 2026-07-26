import "server-only";

import type { AdminCompanyRepository } from "../repositories";
import { SupabaseAdminCompanyRepository } from "../repositories";
import {
  ADMIN_COMPANY_FILTERS,
  type AdminCompanyFilter,
  type AdminCompanyOverview,
  type AdminCompanyPage,
} from "../types";

const COMPANY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListAdminCompaniesInput = {
  page?: string | number;
  search?: string;
  filter?: string;
};

export class AdminCompanyService {
  constructor(private readonly repository: AdminCompanyRepository) {}

  list(input: ListAdminCompaniesInput): Promise<AdminCompanyPage> {
    return this.repository.list({
      page: normalizePage(input.page),
      pageSize: 25,
      search: normalizeSearch(input.search),
      filter: normalizeFilter(input.filter),
    });
  }

  getOverview(companyId: string): Promise<AdminCompanyOverview | null> {
    if (!COMPANY_ID_PATTERN.test(companyId)) return Promise.resolve(null);
    return this.repository.getOverview(companyId);
  }
}

export function normalizeCompanyFilter(value?: string): AdminCompanyFilter {
  return normalizeFilter(value);
}

function normalizePage(value?: string | number): number {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeSearch(value?: string): string {
  return value?.trim().slice(0, 100) ?? "";
}

function normalizeFilter(value?: string): AdminCompanyFilter {
  return ADMIN_COMPANY_FILTERS.includes(value as AdminCompanyFilter)
    ? (value as AdminCompanyFilter)
    : "all";
}

const service = new AdminCompanyService(new SupabaseAdminCompanyRepository());

export function createAdminCompanyService(): AdminCompanyService {
  return service;
}
