export type GlobalOrderProductMembership = {
  orderHistoryId: string;
  orderDate: string;
  productIds: string[];
};

export type GlobalOrderProductMembershipPage = {
  items: GlobalOrderProductMembership[];
  nextCursor: { orderDate: string; orderHistoryId: string } | null;
};

export interface GlobalOrderHistoryAnalyticsRepository {
  getOrderProductMembershipPage(input: {
    dateFrom: string;
    dateTo: string;
    afterOrderDate?: string | null;
    afterOrderHistoryId?: string | null;
    limit?: number;
  }): Promise<GlobalOrderProductMembershipPage>;
}

export class GlobalOrderHistoryAnalyticsRepositoryError extends Error {
  constructor() {
    super("Global order-history analytics read failed.");
    this.name = "GlobalOrderHistoryAnalyticsRepositoryError";
  }
}
