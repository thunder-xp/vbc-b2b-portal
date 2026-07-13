import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, InvalidStateError } from "../../../access-control/services";
import type { PricingInventoryRepository } from "../../../pricing-inventory/repositories";
import type { ProjectSpecificationRepository } from "../../../project-specifications/repositories";
import type { ReservationRequestRepository } from "../../repositories";
import { ReservationRequestStatus, type ReservationRequest, type ReservationRequestItem } from "../../types";
import { DefaultInternalReservationReviewService } from "../internal-reservation-review.service";

const now = "2026-07-13T12:00:00.000Z";

function fixture(status = ReservationRequestStatus.UnderReview) {
  const request: ReservationRequest = { id: "request-1", companyId: "company-1", specificationId: "spec-1", specificationRevisionId: "spec-1", createdBy: "partner-1", status, requestedDeliveryDate: "2026-08-01", partnerComment: null, managerComment: null, submittedAt: now, reviewedAt: null, reviewedBy: null, createdAt: now, updatedAt: now };
  const items: ReservationRequestItem[] = [
    { id: "item-1", reservationRequestId: request.id, productId: "p1", productNameSnapshot: "Camera", skuSnapshot: "C1", slugSnapshot: "camera", specificationQuantity: 5, requestedQuantity: 4, approvedQuantity: null, partnerUnitPriceAmount: 10, partnerCurrencyCode: "USD", retailUnitPriceAmount: 200, retailCurrencyCode: "MDL", createdAt: now, updatedAt: now },
    { id: "item-2", reservationRequestId: request.id, productId: "p2", productNameSnapshot: "Recorder", skuSnapshot: "R1", slugSnapshot: "recorder", specificationQuantity: 2, requestedQuantity: 2, approvedQuantity: null, partnerUnitPriceAmount: 20, partnerCurrencyCode: "USD", retailUnitPriceAmount: 400, retailCurrencyCode: "MDL", createdAt: now, updatedAt: now },
  ];
  const repository: ReservationRequestRepository = {
    listByCompanyId: vi.fn(), listForInternalReview: vi.fn().mockResolvedValue([{ request, companyName: "Partner SRL", projectName: "Office", customerSiteName: "HQ" }]),
    findById: vi.fn().mockResolvedValue(request), findActiveBySpecificationRevisionId: vi.fn(), listItems: vi.fn().mockResolvedValue(items),
    createFromApprovedSpecification: vi.fn(), updateDraft: vi.fn(), updateRequestedQuantity: vi.fn(), submit: vi.fn(),
    canReviewInternally: vi.fn().mockResolvedValue(true), startReview: vi.fn(), decide: vi.fn(),
  };
  const service = new DefaultInternalReservationReviewService(repository, {} as ProjectSpecificationRepository, {} as PricingInventoryRepository);
  return { request, items, repository, service };
}

describe("DefaultInternalReservationReviewService", () => {
  it("enforces internal review authorization", async () => {
    const value = fixture();
    vi.mocked(value.repository.canReviewInternally).mockResolvedValue(false);
    await expect(value.service.listForReview("partner-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("starts review only from submitted", async () => {
    const value = fixture(ReservationRequestStatus.Submitted);
    await value.service.startReview("manager-1", value.request.id);
    expect(value.repository.startReview).toHaveBeenCalledWith(value.request.id);
    const invalid = fixture(ReservationRequestStatus.Approved);
    await expect(invalid.service.startReview("manager-1", invalid.request.id)).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("stores per-line quantities for partial approval", async () => {
    const value = fixture();
    await value.service.decide("manager-1", { requestId: value.request.id, status: ReservationRequestStatus.PartiallyApproved, approvedQuantities: [{ itemId: "item-1", approvedQuantity: 2 }, { itemId: "item-2", approvedQuantity: 2 }], comment: "Partial stock" });
    expect(value.repository.decide).toHaveBeenCalledWith(expect.objectContaining({ status: ReservationRequestStatus.PartiallyApproved, approvedQuantities: [{ itemId: "item-1", approvedQuantity: 2 }, { itemId: "item-2", approvedQuantity: 2 }] }));
  });

  it("rejects approved quantities above requested quantities", async () => {
    const value = fixture();
    await expect(value.service.decide("manager-1", { requestId: value.request.id, status: ReservationRequestStatus.PartiallyApproved, approvedQuantities: [{ itemId: "item-1", approvedQuantity: 5 }, { itemId: "item-2", approvedQuantity: 2 }] })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("requires a rejection comment", async () => {
    const value = fixture();
    await expect(value.service.decide("manager-1", { requestId: value.request.id, status: ReservationRequestStatus.Rejected, approvedQuantities: [], comment: "  " })).rejects.toBeInstanceOf(InvalidStateError);
  });
});
