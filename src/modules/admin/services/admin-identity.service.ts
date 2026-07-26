import "server-only";

import type { AdminIdentityRepository } from "../repositories";
import { SupabaseAdminIdentityRepository } from "../repositories";
import {
  ADMIN_INVITATION_FILTERS,
  ADMIN_USER_FILTERS,
  type AdminInvitationFilter,
  type AdminInvitationPage,
  type AdminUserFilter,
  type AdminUserPage,
} from "../types";

type DirectoryInput = {
  page?: string | number;
  search?: string;
  filter?: string;
};

export class AdminIdentityService {
  constructor(private readonly repository: AdminIdentityRepository) {}

  listUsers(input: DirectoryInput): Promise<AdminUserPage> {
    return this.repository.listUsers({
      page: normalizePage(input.page),
      pageSize: 25,
      search: normalizeSearch(input.search),
      filter: normalizeUserFilter(input.filter),
    });
  }

  listInvitations(input: DirectoryInput): Promise<AdminInvitationPage> {
    return this.repository.listInvitations({
      page: normalizePage(input.page),
      pageSize: 25,
      search: normalizeSearch(input.search),
      filter: normalizeInvitationFilter(input.filter),
    });
  }
}

function normalizePage(value?: string | number): number {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeSearch(value?: string): string {
  return value?.trim().slice(0, 100) ?? "";
}

function normalizeUserFilter(value?: string): AdminUserFilter {
  return ADMIN_USER_FILTERS.includes(value as AdminUserFilter)
    ? (value as AdminUserFilter)
    : "all";
}

function normalizeInvitationFilter(value?: string): AdminInvitationFilter {
  return ADMIN_INVITATION_FILTERS.includes(value as AdminInvitationFilter)
    ? (value as AdminInvitationFilter)
    : "all";
}

const service = new AdminIdentityService(
  new SupabaseAdminIdentityRepository(),
);

export function createAdminIdentityService(): AdminIdentityService {
  return service;
}
