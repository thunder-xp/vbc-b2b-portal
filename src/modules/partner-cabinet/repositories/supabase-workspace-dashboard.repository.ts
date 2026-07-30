import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";

import type {
  WorkspaceDashboardProjection,
  WorkspaceDashboardRepository,
} from "./workspace-dashboard.repository";

const productCandidateSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  slug: z.string(),
  imageUrl: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  labelCodes: z.array(z.enum(["TOP", "NEW", "HOT"])),
  purchaseCount: z.number().int().nonnegative().optional(),
  completedPurchaseCount: z.number().int().nonnegative().optional(),
  lastPurchasedAt: z.string().optional(),
  typicalQuantity: z.number().nonnegative().optional(),
});

const dashboardSchema = z.object({
  attentionItems: z.array(z.object({
    id: z.string().uuid(),
    kind: z.string(),
    objectId: z.string().uuid(),
    objectNumber: z.string().nullable(),
    occurredAt: z.string(),
    comment: z.string().nullable(),
  })),
  orderSummary: z.object({
    active: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    attention: z.number().int().nonnegative(),
    portalProcessing: z.number().int().nonnegative(),
    recent: z.array(z.object({
      id: z.string().uuid(),
      number: z.string(),
      date: z.string(),
      posted: z.boolean(),
      stateCode: z.string().nullable(),
      plannedDate: z.string().nullable(),
      positionCount: z.number().int().nonnegative(),
      total: z.number().nonnegative().nullable(),
      currency: z.string().nullable(),
      href: z.string(),
    })),
  }),
  shipmentSummary: z.object({
    overdue: z.number().int().nonnegative(),
    today: z.number().int().nonnegative(),
    nextThreeDays: z.number().int().nonnegative(),
    later: z.number().int().nonnegative(),
    items: z.array(z.object({
      id: z.string().uuid(),
      orderNumber: z.string(),
      plannedDate: z.string(),
      positionCount: z.number().int().nonnegative(),
      totalUnits: z.number().nonnegative(),
      posted: z.boolean(),
      stateCode: z.string().nullable(),
      pendingDateChange: z.boolean(),
    })),
  }),
  continuationItems: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(["cart", "estimate", "purchasing_list"]),
    name: z.string().nullable(),
    positionCount: z.number().int().nonnegative(),
    totalUnits: z.number().nonnegative(),
    updatedAt: z.string(),
  })),
  reorderProducts: z.array(productCandidateSchema),
  merchandisingProducts: z.array(productCandidateSchema),
  financeSummary: z.object({
    totals: z.array(z.object({
      currency: z.string(),
      receivable: z.number().nonnegative(),
      advance: z.number().nonnegative(),
    })),
    contractCount: z.number().int().nonnegative(),
    lastSuccessfulAt: z.string().nullable(),
    stale: z.boolean(),
  }).nullable(),
  companySummary: z.object({
    activeEmployees: z.number().int().nonnegative(),
    pendingInvitations: z.number().int().nonnegative(),
    suspendedEmployees: z.number().int().nonnegative(),
    retailOnlyEmployees: z.number().int().nonnegative(),
    expiringInvitations: z.number().int().nonnegative(),
    portalStatus: z.string(),
    commercialReady: z.boolean(),
  }).nullable(),
  freshness: z.object({
    ordersUpdatedAt: z.string().nullable(),
    financeUpdatedAt: z.string().nullable(),
  }),
});

export class WorkspaceDashboardRepositoryError extends Error {
  constructor() {
    super("Partner workspace dashboard repository failed.");
    this.name = "WorkspaceDashboardRepositoryError";
  }
}

export class SupabaseWorkspaceDashboardRepository
  implements WorkspaceDashboardRepository
{
  async getDashboard(companyId: string): Promise<WorkspaceDashboardProjection> {
    const { data, error } = await (await createClient()).rpc(
      "get_partner_workspace_dashboard_v2",
      { p_company_id: companyId },
    );

    const parsed = dashboardSchema.safeParse(data);
    if (error || !parsed.success) {
      throw new WorkspaceDashboardRepositoryError();
    }

    return parsed.data satisfies WorkspaceDashboardProjection;
  }
}
