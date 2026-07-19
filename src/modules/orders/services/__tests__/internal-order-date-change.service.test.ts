import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, InvalidStateError } from "../../../access-control/services";
import type { OrderDateChangeRequestRepository } from "../../repositories/order-date-change.repository";
import { DefaultInternalOrderDateChangeService } from "../internal-order-date-change.service";

describe("internal order date-change review", () => {
  it("allows an authorized reviewer to approve without mutating order history", async () => {
    const repository = repo();
    const service = new DefaultInternalOrderDateChangeService(repository);
    await service.review("reviewer", { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "approved", comment: "Update in 1C" });
    expect(repository.review).toHaveBeenCalledWith({ requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "approved", comment: "Update in 1C" });
  });

  it("denies a partner and requires a rejection comment", async () => {
    const denied = repo(); denied.canReviewInternally.mockResolvedValue(false);
    await expect(new DefaultInternalOrderDateChangeService(denied).listPending("partner")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(new DefaultInternalOrderDateChangeService(repo()).review("reviewer", { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "rejected", comment: " " })).rejects.toBeInstanceOf(InvalidStateError);
  });
});

function repo() {
  return {
    canReviewInternally: vi.fn().mockResolvedValue(true), listPendingForReview: vi.fn().mockResolvedValue([]),
    review: vi.fn().mockResolvedValue({}), listLatestByOrderIds: vi.fn(), create: vi.fn(), cancel: vi.fn(),
  } as unknown as OrderDateChangeRequestRepository & { canReviewInternally: ReturnType<typeof vi.fn>; review: ReturnType<typeof vi.fn> };
}
