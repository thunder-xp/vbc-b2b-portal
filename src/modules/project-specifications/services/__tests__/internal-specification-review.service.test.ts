import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, InvalidStateError } from "../../../access-control/services";
import type { ProjectSpecificationRepository } from "../../repositories";
import { ProjectSpecificationStatus, type ProjectSpecification, type ProjectSpecificationItem } from "../../types";
import { DefaultInternalSpecificationReviewService } from "../internal-specification-review.service";

const now = "2026-07-13T12:00:00.000Z";

function fixture(status: ProjectSpecificationStatus = ProjectSpecificationStatus.Submitted) {
  const specification: ProjectSpecification = {
    id: "spec-1", companyId: "company-1", createdBy: "partner-1", projectName: "Office CCTV",
    customerSiteName: "Main office", description: "Two floors", status, submittedAt: now,
    parentSpecificationId: null, revisionNumber: 1, reviewComment: null, reviewedBy: null,
    reviewedAt: null, partnerPurchaseTotalAmount: 200, partnerCurrencyCodeSnapshot: "USD",
    retailTotalAmount: 5000, retailCurrencyCodeSnapshot: "MDL", grossProfitUsdSnapshot: 80,
    markupPercentageSnapshot: 40, commercialSnapshotAt: now, createdAt: now, updatedAt: now,
  };
  const item: ProjectSpecificationItem = {
    id: "item-1", specificationId: "spec-1", productId: "product-1", quantity: 2,
    productNameSnapshot: "Camera", skuSnapshot: "400123", slugSnapshot: "camera",
    partnerUnitPriceAmount: 100, partnerCurrencyCode: "USD", retailUnitPriceAmount: 2500,
    retailCurrencyCode: "MDL", availableStock: 8, nearestArrivalDate: "2026-08-01",
    nearestArrivalQuantity: 12, grossProfitUsd: 40, markupPercentage: 40, snapshotAt: now,
    partnerLineTotalAmount: 200, retailLineTotalAmount: 5000,
    createdAt: now, updatedAt: now,
  };
  const repository: ProjectSpecificationRepository = {
    listByCompanyId: vi.fn(),
    listForInternalReview: vi.fn().mockResolvedValue([{ specification, companyName: "Partner SRL" }]),
    findById: vi.fn().mockResolvedValue(specification), findRevisionByParentId: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue([item]), create: vi.fn(), updateDraft: vi.fn(), addItem: vi.fn(),
    updateItemQuantity: vi.fn(), removeItem: vi.fn(), submit: vi.fn(),
    canReviewInternally: vi.fn().mockResolvedValue(true),
    review: vi.fn().mockResolvedValue({ specificationId: "spec-1", status, revisionId: null }),
  };
  return { repository, service: new DefaultInternalSpecificationReviewService(repository) };
}

describe("DefaultInternalSpecificationReviewService", () => {
  it("denies users without the internal review capability", async () => {
    const { service, repository } = fixture();
    vi.mocked(repository.canReviewInternally).mockResolvedValue(false);
    await expect(service.listForReview("partner-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists submitted specifications with snapshot totals", async () => {
    const { service } = fixture();
    await expect(service.listForReview("manager-1")).resolves.toEqual([expect.objectContaining({
      companyName: "Partner SRL", itemCount: 1, partnerPurchaseTotal: "200,00 $",
      retailTotal: "5 000,00 MDL", potentialGrossProfit: "80,00 $",
    })]);
  });

  it("allows only submitted specifications to enter review", async () => {
    const { service, repository } = fixture();
    await service.startReview("manager-1", "spec-1");
    expect(repository.review).toHaveBeenCalledWith({ specificationId: "spec-1", status: ProjectSpecificationStatus.UnderReview, comment: null });
    const invalid = fixture(ProjectSpecificationStatus.Approved);
    await expect(invalid.service.startReview("manager-1", "spec-1")).rejects.toBeInstanceOf(InvalidStateError);
  });

  it.each([ProjectSpecificationStatus.Approved, ProjectSpecificationStatus.ChangesRequested, ProjectSpecificationStatus.Rejected] as const)("allows the %s decision only from under review", async (decision) => {
    const { service, repository } = fixture(ProjectSpecificationStatus.UnderReview);
    vi.mocked(repository.review).mockResolvedValue({ specificationId: "spec-1", status: decision, revisionId: decision === ProjectSpecificationStatus.ChangesRequested ? "spec-2" : null });
    await service.decide("manager-1", { specificationId: "spec-1", status: decision, comment: "Reviewed by sales." });
    expect(repository.review).toHaveBeenCalledWith({ specificationId: "spec-1", status: decision, comment: "Reviewed by sales." });
  });

  it("requires a response comment and rejects final decisions from submitted", async () => {
    const underReview = fixture(ProjectSpecificationStatus.UnderReview);
    await expect(underReview.service.decide("manager-1", { specificationId: "spec-1", status: ProjectSpecificationStatus.Approved, comment: "   " })).rejects.toBeInstanceOf(InvalidStateError);
    const submitted = fixture();
    await expect(submitted.service.decide("manager-1", { specificationId: "spec-1", status: ProjectSpecificationStatus.Rejected, comment: "No" })).rejects.toBeInstanceOf(InvalidStateError);
  });
});
