import { describe, expect, it, vi } from "vitest";

import type { PricingInventoryService } from "../../../pricing-inventory";
import type { NotificationRepository } from "../../../notifications";
import type { DocumentRepository } from "../../../documents/repositories";
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
  it("passes the server-derived Estimate, conversion, and order capabilities to the shared sales provider", async () => {
    const salesWorkspace = {
      listEstimateOpportunities: vi.fn().mockResolvedValue([]),
    };
    await new DefaultWorkspaceHomeService(
      fakeContextService({
        capabilities: resolveWorkspaceCapabilities(new Set([
          "estimates.view",
          "proposal.send",
          "estimates.convert_to_cart",
          "orders.manage",
        ])),
      }),
      fakeFreshness(),
      fakeDashboardRepository(),
      fakePricingInventoryService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      salesWorkspace as never,
    ).getWorkspaceHome("partner-1");

    expect(salesWorkspace.listEstimateOpportunities).toHaveBeenCalledWith("company-1", {
      canView: true,
      canSend: true,
      canConvert: true,
      canManageOrders: true,
    }, 6);
  });

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
    expect(workspace.quickActions.map((action) => action.key)).toEqual([
      "cart",
      "repeat_order",
      "estimate",
      "documents",
    ]);
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
          title: null,
          description: null,
          plannedDate: "2026-07-29",
          sourceFingerprint: "a".repeat(64),
          dismissPolicy: "until_source_change",
          severity: "warning",
          href: "/cabinet/orders/order-1",
          ctaLabel: "Открыть заказ",
          relevanceState: "active",
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

  it("uses the governed TEST return wording and cooldown policy", async () => {
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      fakeDashboardRepository({
        attentionItems: [{
          id: "11111111-1111-4111-8111-111111111111",
          kind: "test_return_overdue",
          objectId: "11111111-1111-4111-8111-111111111111",
          objectNumber: "NSUU-001498",
          occurredAt: "2026-08-01T00:00:00Z",
          comment: null,
          title: null,
          description: null,
          plannedDate: "2026-08-01",
          sourceFingerprint: "b".repeat(32),
          dismissPolicy: "cooldown_7_days",
          severity: "warning",
          href: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
          ctaLabel: "Открыть заказ",
          relevanceState: "active",
        }],
      }),
      fakePricingInventoryService(),
    ).getWorkspaceHome("partner-1");

    expect(workspace.attentionItems[0]).toMatchObject({
      title: "Тестовый период завершён",
      dismissPolicy: "cooldown_7_days",
      href: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
      orderNumber: "NSUU-001498",
      plannedDate: "2026-08-01",
      isTest: true,
    });
    expect(workspace.attentionItems[0]?.consequence).toContain("вернуть оборудование");
  });

  it("dismisses attention through the company-scoped repository method", async () => {
    const repository = fakeDashboardRepository();
    repository.dismissAttention = vi.fn().mockResolvedValue(undefined);
    const service = new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      repository,
      fakePricingInventoryService(),
    );

    await service.dismissAttention(
      "partner-1",
      "11111111-1111-4111-8111-111111111111",
      "c".repeat(32),
    );

    expect(repository.dismissAttention).toHaveBeenCalledWith(
      "company-1",
      "11111111-1111-4111-8111-111111111111",
      "c".repeat(32),
    );
  });

  it("uses only the canonical dashboard attention projection", async () => {
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
          title: null,
          description: null,
          plannedDate: "2026-07-29",
          sourceFingerprint: "a".repeat(64),
          dismissPolicy: "until_source_change",
          severity: "warning",
          href: "/cabinet/orders/order-1",
          ctaLabel: "Открыть заказ",
          relevanceState: "active",
        }],
      }),
      fakePricingInventoryService(),
      notifications,
    ).getWorkspaceHome("partner-1");

    expect(notifications.list).not.toHaveBeenCalled();
    expect(workspace.attentionItems.map((item) => item.id)).toEqual(["warning-1"]);
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
    expect(workspace.reorderProducts.every((item) =>
      item.product.imageUrl === `/products/${item.product.id}.jpg`)).toBe(true);
  });

  it("keeps bounded product blocks stable within a login and rotates a new login", async () => {
    const candidates = Array.from({ length: 10 }, (_, index) => dashboardProduct(index + 1));
    const dashboardRepository = fakeDashboardRepository();
    dashboardRepository.getProductSelections = vi.fn().mockResolvedValue({
      snapshotHit: true,
      previousProducts: candidates,
      merchandisingProducts: candidates.slice(0, 5),
      previousSourceFingerprint: "orders-v1",
      offerSourceFingerprint: "offers-v1",
      previousCandidateCount: 10,
      offerCandidateCount: 5,
      rotationBucket: 10,
    } satisfies WorkspaceDashboardSelections);
    const opportunityRepository = {
      list: vi.fn().mockResolvedValue({
        totalCount: 10,
        items: candidates.map((candidate) => opportunity(candidate.id)),
      }),
      dismiss: vi.fn(),
    };
    const service = new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      dashboardRepository,
      fakePricingInventoryService(),
      undefined,
      opportunityRepository as never,
    );

    const first = await service.getWorkspaceHome("partner-1", "login-a");
    const same = await service.getWorkspaceHome("partner-1", "login-a");
    const next = await service.getWorkspaceHome("partner-1", "login-b");
    const ids = (workspace: typeof first) => workspace.reorderProducts.map((item) => item.product.id);
    const opportunityIds = (workspace: typeof first) => workspace.opportunities.map((item) => item.id);

    expect(ids(same)).toEqual(ids(first));
    expect(opportunityIds(same)).toEqual(opportunityIds(first));
    expect(ids(next)).not.toEqual(ids(first));
    expect(opportunityIds(next)).not.toEqual(opportunityIds(first));
    expect(first.reorderProducts).toHaveLength(5);
    expect(first.opportunities).toHaveLength(4);
    expect(first.merchandisingProducts.some((item) =>
      first.opportunities.some((opportunityItem) =>
        opportunityItem.product?.id === item.product.id))).toBe(false);
    expect(opportunityRepository.list).toHaveBeenCalledWith({
      companyId: "company-1",
      filter: "all",
      limit: 12,
      offset: 0,
    });
  });

  it("enriches all dashboard opportunities in the existing product-reference batch", async () => {
    const opportunityRepository = {
      list: vi.fn().mockResolvedValue({
        totalCount: 2,
        items: [opportunity("product-1"), opportunity("product-2")],
      }),
      dismiss: vi.fn(),
    };
    const productReferences = {
      getProductReferencesByIds: vi.fn().mockResolvedValue([
        productReference("product-1", "/products/camera.jpg"),
        productReference("product-2", "/products/recorder.jpg"),
      ]),
    };
    const workspace = await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      fakeDashboardRepository(),
      fakePricingInventoryService(),
      undefined,
      opportunityRepository as never,
      undefined,
      undefined,
      productReferences,
    ).getWorkspaceHome("partner-1", "login-1");

    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledWith("partner-1", ["product-1", "product-2"]);
    expect(workspace.opportunities.map((item) => item.product?.reference?.thumbnail)).toEqual([
      "/products/camera.jpg",
      "/products/recorder.jpg",
    ]);
  });

  it("does not block the concise dashboard on document reads", async () => {
    const documents = {
      listPartnerRecent: vi.fn().mockResolvedValue([]),
      listPartner: vi.fn(),
    } as unknown as DocumentRepository;

    await new DefaultWorkspaceHomeService(
      fakeContextService({
        capabilities: resolveWorkspaceCapabilities(new Set([
          "documents.view_company",
          "documents.view_product",
        ])),
      }),
      fakeFreshness(),
      fakeDashboardRepository(),
      fakePricingInventoryService(),
      undefined,
      undefined,
      undefined,
      documents,
    ).getWorkspaceHome("partner-1");

    expect(documents.listPartnerRecent).not.toHaveBeenCalled();
    expect(documents.listPartner).not.toHaveBeenCalled();
  });

  it("skips the dashboard document read when no document type is permitted", async () => {
    const documents = {
      listPartnerRecent: vi.fn(),
      listPartner: vi.fn(),
    } as unknown as DocumentRepository;

    await new DefaultWorkspaceHomeService(
      fakeContextService(),
      fakeFreshness(),
      fakeDashboardRepository(),
      fakePricingInventoryService(),
      undefined,
      undefined,
      undefined,
      documents,
    ).getWorkspaceHome("partner-1");

    expect(documents.listPartnerRecent).not.toHaveBeenCalled();
    expect(documents.listPartner).not.toHaveBeenCalled();
  });
});

function opportunity(productId: string) {
  return {
    id: `opportunity-${productId}`,
    type: "repeat_purchase_available" as const,
    priority: 1,
    reasonCode: "repeat_purchase",
    reasonMetadata: {},
    secondaryReasons: [],
    fingerprint: productId,
    firstDetectedAt: "2026-08-01T00:00:00Z",
    lastConfirmedAt: "2026-08-01T00:00:00Z",
    sourceType: "product",
    sourceId: productId,
    product: { id: productId, sku: productId, name: productId, slug: productId, imageUrl: null, categoryName: null, partnerPrice: null, retailPrice: null, availableQuantity: 1, expectedArrivalDate: null, expectedArrivalQuantity: null },
    template: null,
  };
}

function productReference(productId: string, thumbnail: string) {
  return {
    productId,
    slug: productId,
    sku: productId,
    name: productId,
    thumbnail,
    thumbnailFit: "contain" as const,
    publicationState: "published" as const,
  };
}

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
