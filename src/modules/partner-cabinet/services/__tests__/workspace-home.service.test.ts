import { describe, expect, it, vi } from "vitest";

import type { PricingInventoryService } from "../../../pricing-inventory";
import type { NotificationRepository } from "../../../notifications";
import type { CommercialFreshnessReadModel } from "../../repositories/commercial-freshness.repository";
import type {
  WorkspaceDashboardProjection,
  WorkspaceDashboardRepository,
  WorkspaceDashboardSelections,
} from "../../repositories/workspace-dashboard.repository";
import type { PartnerWorkspaceContextService } from "../workspace-context.service";
import { resolveWorkspaceCapabilities } from "../workspace-capability.service";
import { DefaultWorkspaceHomeService } from "../workspace-home.service";

describe("DefaultWorkspaceHomeService", () => {
  it("builds an operational dashboard from one aggregate and one commercial batch", async () => {
    const dashboardRepository = fakeDashboardRepository({
      reorderProducts: [{
        id: "product-1",
        sku: "400123",
        name: "Camera",
        slug: "camera",
        imageUrl: null,
        categoryId: null,
        categoryName: null,
        labelCodes: [],
        purchaseCount: 4,
      }],
    });
    const pricingInventoryService = fakePricingInventoryService();
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      dashboardRepository,
      pricingInventoryService,
    ).getWorkspaceHome("partner-1");

    expect(dashboardRepository.getDashboard).toHaveBeenCalledOnce();
    expect(pricingInventoryService.getProductCommercialViews).toHaveBeenCalledWith(
      "partner-1",
      ["product-1"],
    );
    expect(workspace.company).toEqual({
      name: "Partner Company",
      role: "Partner Owner",
      priceType: "GOLD",
    });
    expect(workspace.reorderProducts[0]).toMatchObject({
      product: { id: "product-1", sku: "400123" },
      purchaseCount: 4,
    });
    expect(workspace.quickActions).toHaveLength(6);
    expect(JSON.stringify(workspace)).not.toMatch(/f7df2069|33333333/);
  });

  it("does not expose the partner tier without partner-price permission", async () => {
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService({
        capabilities: resolveWorkspaceCapabilities(new Set([
          "catalog.view",
          "pricing.retail_price.view",
          "stock.view",
        ])),
      }),
      fakeFreshness(),
      fakeDashboardRepository(),
      fakePricingInventoryService(),
    ).getWorkspaceHome("partner-1");

    expect(workspace.company.priceType).toBeNull();
    expect(workspace.financeSummary).toBeNull();
    expect(workspace.companySummary).toBeNull();
  });

  it("adds actionable warnings only for real aggregate conditions", async () => {
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      fakeDashboardRepository({
        attentionItems: [{
          id: "warning-1",
          kind: "shipment_overdue",
          objectId: "order-1",
          objectNumber: "NSUU-1",
          occurredAt: "2026-07-29T00:00:00Z",
          comment: null,
        }],
      }),
      fakePricingInventoryService(),
    ).getWorkspaceHome("partner-1");

    expect(workspace.attentionItems).toEqual([
      expect.objectContaining({
        title: "Отгрузка заказа NSUU-1 просрочена",
        href: "/cabinet/orders/order-1",
      }),
    ]);
  });

  it("adds unread critical notifications first and removes duplicate operational links", async () => {
    const notifications = fakeNotificationRepository();
    vi.mocked(notifications.list).mockResolvedValue({
      nextCursor: null,
      items: [
        notification("critical-1", "critical", "/cabinet/orders/order-2"),
        notification("duplicate", "warning", "/cabinet/orders/order-1"),
      ],
    });
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      fakeDashboardRepository({
        attentionItems: [{
          id: "warning-1",
          kind: "shipment_overdue",
          objectId: "order-1",
          objectNumber: "NSUU-1",
          occurredAt: "2026-07-29T00:00:00Z",
          comment: null,
        }],
      }),
      fakePricingInventoryService(),
      notifications,
    ).getWorkspaceHome("partner-1");

    expect(notifications.list).toHaveBeenCalledWith("company-1", {
      unreadOnly: true,
      pageSize: 20,
    });
    expect(workspace.attentionItems.map((item) => item.id)).toEqual([
      "critical-1",
      "warning-1",
    ]);
  });

  it("uses the login-scoped snapshot, five unique products, and one batched image projection", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => dashboardProduct(index + 1));
    const dashboardRepository = fakeDashboardRepository();
    dashboardRepository.getProductSelections = vi.fn().mockResolvedValue({
      snapshotHit: true,
      previousProducts: candidates,
      merchandisingProducts: candidates,
      previousSourceFingerprint: "orders-v1",
      offerSourceFingerprint: "offers-v1",
      previousCandidateCount: 6,
      offerCandidateCount: 5,
      rotationBucket: 10,
    } satisfies WorkspaceDashboardSelections);
    const productReferences = {
      getProductReferencesByIds: vi.fn().mockImplementation(async (_userId: string, productIds: string[]) =>
        productIds.map((productId) => ({
          productId,
          slug: productId,
          sku: productId,
          name: productId,
          thumbnail: `/products/${productId}.jpg`,
          thumbnailFit: "contain" as const,
          publicationState: "published" as const,
        }))),
    };

    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      dashboardRepository,
      fakePricingInventoryService(),
      undefined,
      undefined,
      undefined,
      undefined,
      productReferences,
    ).getWorkspaceHome("partner-1", "2026-08-01T10:00:00Z");

    expect(dashboardRepository.getProductSelections).toHaveBeenCalledWith(
      "partner-1",
      "company-1",
      "2026-08-01T10:00:00Z",
    );
    expect(workspace.reorderProducts).toHaveLength(5);
    expect(workspace.merchandisingProducts).toHaveLength(5);
    expect(new Set(workspace.reorderProducts.map((item) => item.product.id)).size).toBe(5);
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(workspace.reorderProducts[0]?.product.imageUrl).toBe("/products/product-1.jpg");
  });
});

function dashboardProduct(index: number) {
  return {
    id: `product-${index}`,
    sku: `40000${index}`,
    name: `Product ${index}`,
    slug: `product-${index}`,
    imageUrl: null,
    categoryId: null,
    categoryName: null,
    labelCodes: index % 3 === 0 ? ["HOT" as const] : ["TOP" as const],
    purchaseCount: index,
  };
}

function fakeNotificationRepository(): NotificationRepository {
  return {
    getSummary: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
  };
}

function notification(
  id: string,
  severity: "critical" | "warning",
  actionUrl: string,
) {
  return {
    id,
    eventCode: "shipment_overdue",
    eventGroup: "shipments" as const,
    severity,
    mandatory: true,
    title: "Требуется внимание",
    message: "Проверьте отгрузку.",
    actionLabel: "Открыть",
    actionUrl,
    occurredAt: "2026-07-30T10:00:00Z",
    readAt: null,
    dismissedAt: null,
    expiresAt: "2026-08-30T10:00:00Z",
    relativeTime: "",
  };
}

function fakeContextService(
  overrides: Partial<Awaited<ReturnType<PartnerWorkspaceContextService["getWorkspaceContext"]>>> = {},
): PartnerWorkspaceContextService {
  return {
    async getWorkspaceContext() {
      return {
        userId: "partner-1",
        userDisplayName: "Partner User",
        userEmail: "partner@example.com",
        profileStatus: "active",
        accessState: "active",
        companyId: "company-1",
        companyName: "Partner Company",
        companyStatus: "active",
        membershipId: "membership-1",
        membershipStatus: "active",
        membershipRole: "Partner Owner",
        membershipRoleCode: "partner_owner",
        companyLogoAssetPath: null,
        companyLogoUrl: null,
        canManageCompanyLogo: true,
        external1cCode: "UU-001940",
        external1cPriceTypeId: "33333333-3333-4333-8333-333333333333",
        priceTypeName: "GOLD",
        capabilities: resolveWorkspaceCapabilities(new Set([
          "catalog.view",
          "pricing.partner_price.view",
          "pricing.retail_price.view",
          "stock.view",
          "orders.manage",
          "reservations.manage",
          "estimates.view",
          "finance.view_company",
          "company_users.manage",
          "documents.view_company",
        ])),
        ...overrides,
      };
    },
  };
}

function fakeFreshness(): CommercialFreshnessReadModel {
  return {
    async getFreshness() {
      return [
        { domain: "rates", updatedAt: "2026-07-25T00:00:00Z" },
        { domain: "prices", updatedAt: "2026-07-25T00:00:00Z" },
        { domain: "stock", updatedAt: "2026-07-25T00:00:00Z" },
        { domain: "arrivals", updatedAt: "2026-07-25T00:00:00Z" },
      ];
    },
  };
}

function fakeDashboardRepository(
  overrides: Partial<WorkspaceDashboardProjection> = {},
): WorkspaceDashboardRepository & {
  getDashboard: ReturnType<typeof vi.fn<WorkspaceDashboardRepository["getDashboard"]>>;
} {
  return {
    getDashboard: vi.fn(async () => ({
      attentionItems: [],
      orderSummary: {
        active: 0,
        confirmed: 0,
        attention: 0,
        portalProcessing: 0,
        recent: [],
      },
      shipmentSummary: {
        overdue: 0,
        today: 0,
        nextThreeDays: 0,
        later: 0,
        items: [],
      },
      continuationItems: [],
      reorderProducts: [],
      merchandisingProducts: [],
      financeSummary: null,
      companySummary: null,
      freshness: { ordersUpdatedAt: null, financeUpdatedAt: null },
      ...overrides,
    })),
  };
}

function fakePricingInventoryService(): PricingInventoryService & {
  getProductCommercialViews: ReturnType<typeof vi.fn<PricingInventoryService["getProductCommercialViews"]>>;
} {
  return {
    getProductCommercialViews: vi.fn(async (_userId, productIds) =>
      productIds.map((productId) => ({
        productId,
        partnerPrice: null,
        retailPrice: {
          amount: 100,
          currencyCode: "MDL",
          formattedAmount: "100 MDL",
          lastUpdatedAt: "2026-07-30T00:00:00Z",
        },
        stock: {
          status: "in_stock" as const,
          label: "В наличии: 2 шт.",
          exactAvailableQuantity: 2,
          exactPhysicalQuantity: 2,
          exactReservedQuantity: 0,
          exactIncomingQuantity: 0,
          expectedArrival: null,
          hasVariantStock: false,
          lastUpdatedAt: "2026-07-30T00:00:00Z",
        },
        retailBelowPartnerPrice: false,
        isDemoData: false,
      })),
    ),
  };
}
