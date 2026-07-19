import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../../access-control/services";
import type { OrderProvider } from "../../../integration/contracts";
import type { OrderDateChangeRequestRepository } from "../../repositories/order-date-change.repository";
import { OrderDateChangeRepositoryError } from "../../repositories/order-date-change.repository";
import type { PartnerOrderHistoryRepository } from "../../repositories/order-history.repository";
import type { PartnerOrderRepository } from "../../repositories/order.repository";
import type { OrderDateChangeRequest, PartnerOrderHistory } from "../../types";
import { DefaultPartnerOrderHistoryService } from "../order-history.service";

describe("partner order date-change requests", () => {
  it("creates a future request for an eligible order without changing the authoritative date", async () => {
    const { service, dateChanges, history } = setup(order());

    const created = await service.createDateChangeRequest("user-1", order().id, "2099-08-01", "Call first");

    expect(created.requestedDate).toBe("2099-08-01");
    expect(dateChanges.create).toHaveBeenCalledWith({ orderHistoryId: order().id, requestedDate: "2099-08-01", comment: "Call first" });
    expect(history.upsertBatch).not.toHaveBeenCalled();
  });

  it("blocks cross-company and completed orders", async () => {
    const crossCompany = setup(order({ companyId: "22222222-2222-4222-8222-222222222222" })).service;
    await expect(crossCompany.createDateChangeRequest("user-1", order().id, "2099-08-01", "")).rejects.toBeInstanceOf(NotFoundError);

    const completed = setup(order({ oneCStateCode: "completed" })).service;
    await expect(completed.createDateChangeRequest("user-1", order().id, "2099-08-01", "")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps the unique pending constraint to a safe state error", async () => {
    const fixture = setup(order());
    fixture.dateChanges.create.mockRejectedValue(new OrderDateChangeRepositoryError("23505"));
    await expect(fixture.service.createDateChangeRequest("user-1", order().id, "2099-08-01", "")).rejects.toBeInstanceOf(InvalidStateError);
  });
});

function setup(currentOrder: PartnerOrderHistory) {
  const history = { findVisibleById: vi.fn().mockResolvedValue(currentOrder), upsertBatch: vi.fn() } as unknown as PartnerOrderHistoryRepository;
  const dateChanges = {
    listLatestByOrderIds: vi.fn().mockResolvedValue(new Map()),
    create: vi.fn().mockResolvedValue(request()),
    cancel: vi.fn().mockResolvedValue(request({ status: "cancelled" })),
  } as unknown as OrderDateChangeRequestRepository & { create: ReturnType<typeof vi.fn> };
  const companyAccess = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "11111111-1111-4111-8111-111111111111", status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "11111111-1111-4111-8111-111111111111" } }),
  } as unknown as CompanyAccessService;
  const service = new DefaultPartnerOrderHistoryService(history, {} as PartnerOrderRepository, companyAccess, { ensurePermission: vi.fn() } as unknown as PermissionService, {} as OrderProvider, dateChanges);
  return { service, dateChanges, history };
}

function order(overrides: Partial<PartnerOrderHistory> = {}): PartnerOrderHistory {
  return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", companyId: "11111111-1111-4111-8111-111111111111", portalOrderId: null, external1cOrderRef: "ref", external1cOrderNumber: "NSUU-1", oneCPosted: true, oneCDeletionMark: false, oneCStateRef: null, oneCStateRaw: "Открыт", oneCStateCode: "open", oneCDocumentDate: "2026-07-19T10:00:00Z", oneCDeliveryDate: "2026-07-25", oneCSourceVersion: "v1", oneCLastSyncedAt: "2026-07-19T11:00:00Z", externalContractRef: null, externalCurrencyRef: null, documentTotal: 100, currencyCode: "MDL", originType: "internal_1c", partnerVisible: true, hiddenReason: null, positionCount: 2, totalUnitCount: 5, createdAt: "2026-07-19T10:00:00Z", updatedAt: "2026-07-19T11:00:00Z", ...overrides };
}

function request(overrides: Partial<OrderDateChangeRequest> = {}): OrderDateChangeRequest {
  return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", companyId: order().companyId, orderHistoryId: order().id, requestedBy: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", currentDateSnapshot: "2026-07-25", requestedDate: "2099-08-01", comment: null, status: "pending", reviewedBy: null, reviewedAt: null, reviewComment: null, synchronizedAt: null, createdAt: "2026-07-19T12:00:00Z", updatedAt: "2026-07-19T12:00:00Z", ...overrides };
}
