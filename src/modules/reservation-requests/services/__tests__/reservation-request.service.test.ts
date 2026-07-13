import { describe, expect, it, vi } from "vitest";

import { InvalidStateError } from "../../../access-control/services";
import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import { MembershipStatus } from "../../../access-control/types";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { ProjectSpecificationRepository } from "../../../project-specifications/repositories";
import { ProjectSpecificationStatus, type ProjectSpecification } from "../../../project-specifications/types";
import type { ReservationRequestRepository } from "../../repositories";
import { ReservationRequestStatus, type ReservationRequest, type ReservationRequestItem } from "../../types";
import { DefaultReservationRequestService } from "../reservation-request.service";

const now = "2026-07-13T12:00:00.000Z";

function fixture(specificationStatus = ProjectSpecificationStatus.Approved, requestStatus = ReservationRequestStatus.Draft) {
  const specification: ProjectSpecification = {
    id: "spec-approved", companyId: "company-1", createdBy: "partner-1", projectName: "Warehouse CCTV",
    customerSiteName: "Warehouse", description: null, status: specificationStatus, submittedAt: now,
    parentSpecificationId: null, revisionNumber: 1, reviewComment: null, reviewedBy: null, reviewedAt: null,
    partnerPurchaseTotalAmount: 200, partnerCurrencyCodeSnapshot: "USD", retailTotalAmount: 4000,
    retailCurrencyCodeSnapshot: "MDL", grossProfitUsdSnapshot: 30, markupPercentageSnapshot: 15,
    commercialSnapshotAt: now, createdAt: now, updatedAt: now,
  };
  const request: ReservationRequest = {
    id: "request-1", companyId: "company-1", specificationId: "spec-approved",
    specificationRevisionId: "spec-approved", createdBy: "partner-1", status: requestStatus,
    requestedDeliveryDate: "2026-08-01", partnerComment: null, managerComment: null,
    submittedAt: requestStatus === ReservationRequestStatus.Draft ? null : now,
    reviewedAt: null, reviewedBy: null, createdAt: now, updatedAt: now,
  };
  const item: ReservationRequestItem = {
    id: "item-1", reservationRequestId: request.id, productId: "product-1", productNameSnapshot: "Camera",
    skuSnapshot: "400123", slugSnapshot: "camera", specificationQuantity: 5, requestedQuantity: 5,
    approvedQuantity: null, partnerUnitPriceAmount: 100, partnerCurrencyCode: "USD",
    retailUnitPriceAmount: 2000, retailCurrencyCode: "MDL", createdAt: now, updatedAt: now,
  };
  const repository: ReservationRequestRepository = {
    listByCompanyId: vi.fn().mockResolvedValue([request]), listForInternalReview: vi.fn(),
    findById: vi.fn().mockResolvedValue(request), findActiveBySpecificationRevisionId: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue([item]), createFromApprovedSpecification: vi.fn().mockResolvedValue(request),
    updateDraft: vi.fn().mockResolvedValue(request), updateRequestedQuantity: vi.fn().mockResolvedValue(item),
    submit: vi.fn().mockResolvedValue({ ...request, status: ReservationRequestStatus.Submitted }),
    canReviewInternally: vi.fn(), startReview: vi.fn(), decide: vi.fn(),
  };
  const specificationRepository = {
    findById: vi.fn().mockResolvedValue(specification),
  } as unknown as ProjectSpecificationRepository;
  const companyAccessService = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: MembershipStatus.Active }]),
    validateCompanyAccess: vi.fn().mockResolvedValue(true),
  } as unknown as CompanyAccessService;
  const permissionService = { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) } as unknown as PermissionService;
  const pricingService = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: "product-1", partnerPrice: null, retailPrice: null, commercialOpportunity: null, stock: { exactAvailableQuantity: 3, expectedArrival: { expectedDate: "2026-08-10", expectedQuantity: 8 } }, isDemoData: false, retailBelowPartnerPrice: false }]) } as unknown as PricingInventoryService;
  return { request, item, repository, specificationRepository, service: new DefaultReservationRequestService(repository, specificationRepository, companyAccessService, permissionService, pricingService) };
}

describe("DefaultReservationRequestService", () => {
  it("allows creation only from an approved specification", async () => {
    const invalid = fixture(ProjectSpecificationStatus.Submitted);
    await expect(invalid.service.createDraft("partner-1", { specificationId: "spec-approved", requestedDeliveryDate: "2026-08-01" })).rejects.toBeInstanceOf(InvalidStateError);
    expect(invalid.repository.createFromApprovedSpecification).not.toHaveBeenCalled();
  });

  it("blocks a duplicate active request for the approved revision", async () => {
    const value = fixture();
    vi.mocked(value.repository.findActiveBySpecificationRevisionId).mockResolvedValue(value.request);
    await expect(value.service.createDraft("partner-1", { specificationId: "spec-approved", requestedDeliveryDate: "2026-08-01" })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("creates through the atomic snapshot RPC without changing the specification", async () => {
    const value = fixture();
    await value.service.createDraft("partner-1", { specificationId: "spec-approved", requestedDeliveryDate: "2026-08-01", partnerComment: "Site deadline" });
    expect(value.repository.createFromApprovedSpecification).toHaveBeenCalledWith({ specificationId: "spec-approved", requestedDeliveryDate: "2026-08-01", partnerComment: "Site deadline" });
    expect(value.specificationRepository.findById).toHaveBeenCalledTimes(1);
  });

  it("requires positive quantities not exceeding the approved snapshot", async () => {
    const value = fixture();
    await expect(value.service.updateQuantity("partner-1", "request-1", "item-1", 0)).rejects.toBeInstanceOf(InvalidStateError);
    await expect(value.service.updateQuantity("partner-1", "request-1", "item-1", 6)).rejects.toBeInstanceOf(InvalidStateError);
    await value.service.updateQuantity("partner-1", "request-1", "item-1", 4);
    expect(value.repository.updateRequestedQuantity).toHaveBeenCalledWith({ itemId: "item-1", requestedQuantity: 4 });
  });

  it("keeps submitted requests immutable for partner updates", async () => {
    const value = fixture(ProjectSpecificationStatus.Approved, ReservationRequestStatus.Submitted);
    await expect(value.service.updateQuantity("partner-1", "request-1", "item-1", 2)).rejects.toBeInstanceOf(InvalidStateError);
    await expect(value.service.updateDraft("partner-1", "request-1", { requestedDeliveryDate: "2026-08-01" })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("resolves stock and nearest arrival live instead of from request rows", async () => {
    const value = fixture();
    const detail = await value.service.getDetail("partner-1", "request-1");
    expect(detail.lines[0].availability).toEqual({ availableStock: 3, nearestArrivalDate: "2026-08-10", nearestArrivalQuantity: 8 });
    expect(value.item).not.toHaveProperty("availableStock");
  });
});
