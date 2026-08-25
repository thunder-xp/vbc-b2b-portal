import { describe, expect, it, vi } from "vitest";

import type { OrderReconciliationRepository } from "../../repositories";
import { PartnerOrderIntegrationStatus, PartnerOrderStatus, type PartnerOrder } from "../../types";
import { OrderReconciliationWorkerService } from "../order-reconciliation-worker.service";

describe("OrderReconciliationWorkerService", () => {
  it.each([
    [PartnerOrderStatus.Submitted, PartnerOrderIntegrationStatus.Confirmed, "confirmed"],
    [PartnerOrderStatus.Failed, PartnerOrderIntegrationStatus.ConfirmedNotCreated, "confirmed_not_created"],
    [PartnerOrderStatus.Unknown, PartnerOrderIntegrationStatus.ManualReviewRequired, "manual_review_required"],
  ] as const)("records %s/%s as %s", async (status, integrationStatus, expected) => {
    const dependencies = makeDependencies({ status, integrationStatus });

    const result = await dependencies.worker.processBatch();

    expect(result.claimed).toBe(1);
    expect(dependencies.reconcileInternal).toHaveBeenCalledOnce();
    expect(dependencies.repository.finish).toHaveBeenCalledWith(expect.objectContaining({ result: expected }));
  });

  it("schedules a bounded retry after an unavailable deterministic read-back", async () => {
    const dependencies = makeDependencies();
    dependencies.reconcileInternal.mockRejectedValueOnce(new Error("ONE_C_TIMEOUT"));

    const result = await dependencies.worker.processBatch();

    expect(result.retryScheduled).toBe(1);
    expect(dependencies.repository.finish).toHaveBeenCalledWith(expect.objectContaining({
      result: "retry_scheduled",
      safeErrorCode: "ONE_C_TIMEOUT",
      retryAfterSeconds: 30,
    }));
  });

  it("claims one bounded batch and never creates or submits an order", async () => {
    const dependencies = makeDependencies();

    await dependencies.worker.processBatch(50);

    expect(dependencies.repository.claim).toHaveBeenCalledWith(5, 180);
    expect(dependencies.reconcileInternal).toHaveBeenCalledTimes(1);
  });
});

function makeDependencies(overrides: Partial<PartnerOrder> = {}) {
  const repository = {
    claim: vi.fn().mockResolvedValue([{ orderId: "order-1", correlationId: "correlation-1", attemptNumber: 1 }]),
    finish: vi.fn().mockResolvedValue(true),
  } satisfies OrderReconciliationRepository;
  const reconcileInternal = vi.fn().mockResolvedValue({
    id: "order-1",
    status: PartnerOrderStatus.Submitted,
    integrationStatus: PartnerOrderIntegrationStatus.Confirmed,
    ...overrides,
  } as PartnerOrder);
  return {
    repository,
    reconcileInternal,
    worker: new OrderReconciliationWorkerService(repository, { reconcileInternal }),
  };
}
