import type { WarehouseArrivalFilters, WarehouseArrivalSummary } from "../types";

export type WarehouseArrivalProjection = {
  id: string;
  completedAt: string;
  productCount: number;
  seen: boolean;
  productIds: string[];
};

export interface WarehouseArrivalRepository {
  list(companyId: string, input: Required<Pick<WarehouseArrivalFilters, "availability" | "unseenOnly" | "pageSize">> & WarehouseArrivalFilters & { offset: number }): Promise<{ items: WarehouseArrivalSummary[]; totalCount: number }>;
  get(companyId: string, arrivalId: string): Promise<WarehouseArrivalProjection | null>;
  markSeen(companyId: string, arrivalId: string): Promise<void>;
}
export class WarehouseArrivalRepositoryError extends Error {
  constructor() {
    super("Warehouse arrival repository failed.");
    this.name = "WarehouseArrivalRepositoryError";
  }
}
