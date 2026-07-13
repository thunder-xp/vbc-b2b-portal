import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import { InvalidStateError } from "../../../access-control/services";
import { CompanyStatus, MembershipStatus, UserStatus, UserType } from "../../../access-control/types";
import type { CatalogService } from "../../../catalog/services";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { ProjectSpecificationRepository } from "../../repositories";
import { ProjectSpecificationStatus, type ProjectSpecification, type ProjectSpecificationItem } from "../../types";
import { DefaultProjectSpecificationService } from "../project-specification.service";

const now = "2026-07-13T10:00:00.000Z";

function createFixture(status = ProjectSpecificationStatus.Draft) {
  const specification: ProjectSpecification = {
    id: "spec-1",
    companyId: "company-1",
    createdBy: "user-1",
    projectName: "Warehouse CCTV",
    customerSiteName: "Main warehouse",
    description: null,
    status,
    submittedAt: status === ProjectSpecificationStatus.Submitted ? now : null,
    parentSpecificationId: null,
    revisionNumber: 1,
    reviewComment: null,
    reviewedBy: null,
    reviewedAt: null,
    partnerPurchaseTotalAmount: status === ProjectSpecificationStatus.Draft ? null : 200,
    partnerCurrencyCodeSnapshot: status === ProjectSpecificationStatus.Draft ? null : "USD",
    retailTotalAmount: status === ProjectSpecificationStatus.Draft ? null : 5000,
    retailCurrencyCodeSnapshot: status === ProjectSpecificationStatus.Draft ? null : "MDL",
    grossProfitUsdSnapshot: status === ProjectSpecificationStatus.Draft ? null : 80,
    markupPercentageSnapshot: status === ProjectSpecificationStatus.Draft ? null : 40,
    commercialSnapshotAt: status === ProjectSpecificationStatus.Draft ? null : now,
    createdAt: now,
    updatedAt: now,
  };
  const items: ProjectSpecificationItem[] = [{
    id: "item-1", specificationId: "spec-1", productId: "product-1", quantity: 2,
    productNameSnapshot: status === ProjectSpecificationStatus.Draft ? null : "Camera",
    skuSnapshot: status === ProjectSpecificationStatus.Draft ? null : "400123",
    slugSnapshot: status === ProjectSpecificationStatus.Draft ? null : "camera",
    partnerUnitPriceAmount: status === ProjectSpecificationStatus.Draft ? null : 100,
    partnerCurrencyCode: status === ProjectSpecificationStatus.Draft ? null : "USD",
    retailUnitPriceAmount: status === ProjectSpecificationStatus.Draft ? null : 2500,
    retailCurrencyCode: status === ProjectSpecificationStatus.Draft ? null : "MDL",
    availableStock: status === ProjectSpecificationStatus.Draft ? null : 8,
    nearestArrivalDate: status === ProjectSpecificationStatus.Draft ? null : "2026-08-01",
    nearestArrivalQuantity: status === ProjectSpecificationStatus.Draft ? null : 12,
    grossProfitUsd: status === ProjectSpecificationStatus.Draft ? null : 40,
    markupPercentage: status === ProjectSpecificationStatus.Draft ? null : 40,
    partnerLineTotalAmount: status === ProjectSpecificationStatus.Draft ? null : 200,
    retailLineTotalAmount: status === ProjectSpecificationStatus.Draft ? null : 5000,
    snapshotAt: status === ProjectSpecificationStatus.Draft ? null : now,
    createdAt: now, updatedAt: now,
  }];
  const repository: ProjectSpecificationRepository = {
    listByCompanyId: vi.fn().mockResolvedValue([specification]),
    listForInternalReview: vi.fn().mockResolvedValue([{ specification, companyName: "Partner Company" }]),
    findById: vi.fn().mockResolvedValue(specification),
    findRevisionByParentId: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue(items),
    create: vi.fn().mockResolvedValue(specification),
    updateDraft: vi.fn().mockResolvedValue(specification),
    addItem: vi.fn().mockResolvedValue(items[0]),
    updateItemQuantity: vi.fn().mockResolvedValue(items[0]),
    removeItem: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({ ...specification, status: ProjectSpecificationStatus.Submitted, submittedAt: now }),
    canReviewInternally: vi.fn().mockResolvedValue(true),
    review: vi.fn(),
  };
  const companyAccessService: CompanyAccessService = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ id: "membership-1", userId: "user-1", companyId: "company-1", roleId: "role-1", status: MembershipStatus.Active, approvedBy: null, approvedAt: null, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "partner@example.com", fullName: "Partner", phone: null, userType: UserType.Partner, status: UserStatus.Active, createdAt: now, updatedAt: now },
      company: { id: "company-1", external1cId: "one-c-company", displayName: "Partner Company", status: CompanyStatus.Active, createdAt: now, updatedAt: now },
      membership: { id: "membership-1", userId: "user-1", companyId: "company-1", roleId: "role-1", status: MembershipStatus.Active, approvedBy: null, approvedAt: null, revokedBy: null, revokedAt: null, createdAt: now, updatedAt: now },
    }),
    validateCompanyAccess: vi.fn(),
    ensureActiveMembership: vi.fn(),
  };
  const permissionService: PermissionService = {
    getRole: vi.fn(),
    getRolePermissions: vi.fn(),
    hasPermission: vi.fn(),
    ensurePermission: vi.fn().mockResolvedValue(undefined),
  };
  const catalogService: CatalogService = {
    listCategories: vi.fn(), listBrands: vi.fn(), listProducts: vi.fn(), getProductDetailBySlug: vi.fn(),
    getProductsByIds: vi.fn().mockResolvedValue([{ id: "product-1", sku: "400123", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }]),
  };
  const pricingInventoryService: PricingInventoryService = {
    getProductCommercialViews: vi.fn().mockResolvedValue([{
      productId: "product-1",
      partnerPrice: { amount: 100, currencyCode: "USD", formattedAmount: "$100.00" },
      retailPrice: { amount: 2500, currencyCode: "MDL", formattedAmount: "2 500,00 MDL" },
      commercialOpportunity: { retailPriceUsd: 140, grossProfitUsd: 40, markupPercent: 40, formattedGrossProfit: "$40.00", formattedMarkup: "40%" },
      stock: { status: "in_stock", label: "In stock", exactAvailableQuantity: 8, exactPhysicalQuantity: 10, exactReservedQuantity: 2, exactIncomingQuantity: 0, expectedArrival: { expectedQuantity: 12, expectedDate: "2026-08-01", formattedExpectedDate: "01.08.2026", sourceStatus: "confirmed_supply" }, hasVariantStock: false, lastUpdatedAt: now },
      isDemoData: false,
      retailBelowPartnerPrice: false,
    }]),
  };
  const service = new DefaultProjectSpecificationService(repository, companyAccessService, permissionService, catalogService, pricingInventoryService);
  return { service, repository, items };
}

describe("DefaultProjectSpecificationService", () => {
  it("calculates current line and specification commercial totals", async () => {
    const { service } = createFixture();
    const detail = await service.getDetail("user-1", "spec-1");
    expect(detail.lines[0]).toMatchObject({ partnerLineTotal: "200,00 $", retailLineTotal: "5 000,00 MDL", availableStock: 8, nearestArrivalDate: "01.08.2026" });
    expect(detail.totals).toMatchObject({ partnerPurchaseTotal: "200,00 $", retailTotal: "5 000,00 MDL", potentialGrossProfit: "80,00 $", markupPercentage: "40%" });
  });

  it("uses active company access and the dedicated permission", async () => {
    const { service } = createFixture();
    await service.listOwnCompanySpecifications("user-1");
    const permission = Reflect.get(service, "permissionService") as PermissionService;
    expect(permission.ensurePermission).toHaveBeenCalledWith("user-1", "company-1", "specifications.manage");
  });

  it("increments an existing product instead of creating a duplicate line", async () => {
    const { service, repository } = createFixture();
    await service.addItem("user-1", "spec-1", "product-1", 3);
    expect(repository.updateItemQuantity).toHaveBeenCalledWith({ itemId: "item-1", quantity: 5 });
    expect(repository.addItem).not.toHaveBeenCalled();
  });

  it("rejects mutations after submission", async () => {
    const { service, repository } = createFixture(ProjectSpecificationStatus.Submitted);
    await expect(service.updateItemQuantity("user-1", "spec-1", "item-1", 4)).rejects.toBeInstanceOf(InvalidStateError);
    expect(repository.updateItemQuantity).not.toHaveBeenCalled();
  });

  it("rejects empty draft submission", async () => {
    const { service, repository } = createFixture();
    vi.mocked(repository.listItems).mockResolvedValue([]);
    await expect(service.submit("user-1", "spec-1")).rejects.toBeInstanceOf(InvalidStateError);
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("submits an immutable commercial snapshot for every item", async () => {
    const { service, repository } = createFixture();
    await service.submit("user-1", "spec-1");
    expect(repository.submit).toHaveBeenCalledWith("spec-1", [{
      itemId: "item-1", productName: "Camera", sku: "400123", slug: "camera",
      partnerUnitPriceAmount: 100, partnerCurrencyCode: "USD",
      retailUnitPriceAmount: 2500, retailCurrencyCode: "MDL", availableStock: 8,
      nearestArrivalDate: "2026-08-01", nearestArrivalQuantity: 12,
      grossProfitUsd: 40, markupPercentage: 40,
    }]);
  });

  it("reads submitted values from the snapshot without refreshing commercial truth", async () => {
    const { service } = createFixture(ProjectSpecificationStatus.Submitted);
    const pricing = Reflect.get(service, "pricingInventoryService") as PricingInventoryService;
    const catalog = Reflect.get(service, "catalogService") as CatalogService;
    const detail = await service.getDetail("user-1", "spec-1");
    expect(detail.lines[0]).toMatchObject({ partnerUnitPrice: "100,00 $", availableStock: 8 });
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
  });
});
