import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { z } from "zod";

import type {
  WorkspaceDashboardProjection,
  WorkspaceDashboardRepository,
  WorkspaceDashboardSelections,
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
    title: z.string().nullable(),
    description: z.string().nullable(),
    plannedDate: z.string().nullable(),
    sourceFingerprint: z.string().regex(/^[0-9a-f]{32}$/),
    dismissPolicy: z.enum(["until_source_change", "cooldown_7_days"]),
    severity: z.enum(["info", "warning"]),
    href: z.union([
      z.literal("/cabinet/cart"),
      z.string().startsWith("/cabinet/orders/"),
    ]),
    ctaLabel: z.string().min(1),
    relevanceState: z.literal("active"),
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
      isTest: z.boolean(),
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
      isTest: z.boolean(),
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

const selectionsSchema = z.object({
  snapshotHit: z.boolean(),
  previousSourceFingerprint: z.string(),
  offerSourceFingerprint: z.string(),
  previousProducts: z.array(productCandidateSchema).max(12),
  merchandisingProducts: z.array(productCandidateSchema).max(12),
  previousCandidateCount: z.number().int().nonnegative(),
  offerCandidateCount: z.number().int().nonnegative(),
  rotationBucket: z.number().int().nonnegative(),
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
      "get_partner_workspace_dashboard_v3",
      { p_company_id: companyId },
    );

    const parsed = dashboardSchema.safeParse(data);
    if (error || !parsed.success) {
      throw new WorkspaceDashboardRepositoryError();
    }

    return parsed.data satisfies WorkspaceDashboardProjection;
  }

  async dismissAttention(
    companyId: string,
    itemId: string,
    sourceFingerprint: string,
  ): Promise<void> {
    const { error } = await (await createClient()).rpc(
      "dismiss_partner_dashboard_attention",
      {
        p_company_id: companyId,
        p_item_id: itemId,
        p_source_fingerprint: sourceFingerprint,
      },
    );
    if (error) throw new WorkspaceDashboardRepositoryError();
  }

  async getProductSelections(
    userId: string,
    companyId: string,
    loginGeneration: string,
  ): Promise<WorkspaceDashboardSelections> {
    const startedAt = performance.now();
    const { data, error } = await createAdminClient().rpc(
      "get_or_refresh_partner_dashboard_selections",
      {
        p_user_id: userId,
        p_company_id: companyId,
        p_login_generation: loginGeneration,
      },
    );
    const parsed = selectionsSchema.safeParse(data);
    if (error || !parsed.success) throw new WorkspaceDashboardRepositoryError();
    console.info({
      event: parsed.data.snapshotHit
        ? "partner_dashboard_selection_snapshot_hit"
        : "partner_dashboard_selection_refreshed",
      snapshotHit: parsed.data.snapshotHit,
      previousPurchaseCandidates: parsed.data.previousCandidateCount,
      merchandisingCandidates: parsed.data.offerCandidateCount,
      finalLabelMix: labelMix(parsed.data.merchandisingProducts),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return parsed.data;
  }
}

function labelMix(products: Array<{ labelCodes: string[] }>) {
  return Object.fromEntries(["TOP", "NEW", "HOT"].map((label) => [
    label,
    products.filter((product) => product.labelCodes.includes(label)).length,
  ]));
}
