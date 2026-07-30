export type WorkspaceDashboardProductCandidate = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  labelCodes: Array<"TOP" | "NEW" | "HOT">;
  purchaseCount?: number;
  completedPurchaseCount?: number;
  lastPurchasedAt?: string;
  typicalQuantity?: number;
};

export type WorkspaceDashboardProjection = {
  attentionItems: Array<{
    id: string;
    kind: string;
    objectId: string;
    objectNumber: string | null;
    occurredAt: string;
    comment: string | null;
  }>;
  orderSummary: {
    active: number;
    confirmed: number;
    attention: number;
    portalProcessing: number;
    recent: Array<{
      id: string;
      number: string;
      date: string;
      posted: boolean;
      stateCode: string | null;
      plannedDate: string | null;
      positionCount: number;
      total: number | null;
      currency: string | null;
      href: string;
    }>;
  };
  shipmentSummary: {
    overdue: number;
    today: number;
    nextThreeDays: number;
    later: number;
    items: Array<{
      id: string;
      orderNumber: string;
      plannedDate: string;
      positionCount: number;
      totalUnits: number;
      posted: boolean;
      stateCode: string | null;
      pendingDateChange: boolean;
    }>;
  };
  continuationItems: Array<{
    id: string;
    kind: "cart" | "estimate" | "purchasing_list";
    name: string | null;
    positionCount: number;
    totalUnits: number;
    updatedAt: string;
  }>;
  reorderProducts: WorkspaceDashboardProductCandidate[];
  merchandisingProducts: WorkspaceDashboardProductCandidate[];
  financeSummary: null | {
    totals: Array<{ currency: string; receivable: number; advance: number }>;
    contractCount: number;
    lastSuccessfulAt: string | null;
    stale: boolean;
  };
  companySummary: null | {
    activeEmployees: number;
    pendingInvitations: number;
    suspendedEmployees: number;
    retailOnlyEmployees: number;
    expiringInvitations: number;
    portalStatus: string;
    commercialReady: boolean;
  };
  freshness: {
    ordersUpdatedAt: string | null;
    financeUpdatedAt: string | null;
  };
};

export interface WorkspaceDashboardRepository {
  getDashboard(companyId: string): Promise<WorkspaceDashboardProjection>;
}
