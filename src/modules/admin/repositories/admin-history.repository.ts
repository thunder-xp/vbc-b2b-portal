import type { AdminHistoryPage } from "../types";

export type ListAdminHistoryInput = {
  companyId?: string;
  userId?: string;
  page: number;
  pageSize: number;
};

export interface AdminHistoryRepository {
  list(input: ListAdminHistoryInput): Promise<AdminHistoryPage>;
}
