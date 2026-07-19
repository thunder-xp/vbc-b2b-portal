import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import type { OrderProvider } from "../../../integration/contracts";
import type { PartnerOrderHistoryRepository, PartnerOrderRepository } from "../../repositories";
import type { PartnerOrderHistory } from "../../types";
import { DefaultPartnerOrderHistoryService, getPlannedShipmentIndicator } from "../order-history.service";

describe("planned shipments", () => {
  it.each([
    ["2026-07-25", "scheduled", "Запланировано"],
    ["2026-07-23", "soon", "Скоро отгрузка"],
    ["2026-07-20", "today", "Сегодня"],
    ["2026-07-19", "overdue", "Дата прошла"],
  ])("derives %s as %s", (date, indicator, label) => {
    expect(getPlannedShipmentIndicator(date, new Date("2026-07-20T10:00:00Z"))).toMatchObject({ dateIndicator: indicator, dateIndicatorLabel: label });
  });

  it("loads one company-scoped page without item reads or 1C calls", async () => {
    const repository = {
      listPlannedShipments: vi.fn().mockResolvedValue({ items: [order()], total: 1 }),
      listItemsByOrderIds: vi.fn(),
    } as unknown as PartnerOrderHistoryRepository;
    const provider = {} as OrderProvider;
    const service = new DefaultPartnerOrderHistoryService(
      repository,
      {} as PartnerOrderRepository,
      { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }) } as unknown as CompanyAccessService,
      { ensurePermission: vi.fn() } as unknown as PermissionService,
      provider,
    );

    const result = await service.listPlannedShipments("user-1");

    expect(result.shipments).toHaveLength(1);
    expect(repository.listPlannedShipments).toHaveBeenCalledOnce();
    expect(repository.listItemsByOrderIds).not.toHaveBeenCalled();
    expect(provider.fetchSalesOrderHistory).toBeUndefined();
  });
});

function order(): PartnerOrderHistory {
  return { id: "order-1", companyId: "company-1", portalOrderId: null, external1cOrderRef: "ref", external1cOrderNumber: "NSUU-1", oneCPosted: true, oneCDeletionMark: false, oneCStateRef: null, oneCStateRaw: "Открыт", oneCStateCode: "open", oneCDocumentDate: "2026-07-19T10:00:00Z", oneCDeliveryDate: "2026-07-21", oneCSourceVersion: "v1", oneCLastSyncedAt: "2026-07-19T11:00:00Z", externalContractRef: null, externalCurrencyRef: null, documentTotal: 100, currencyCode: "MDL", originType: "internal_1c", partnerVisible: true, hiddenReason: null, positionCount: 2, totalUnitCount: 5, createdAt: "2026-07-19T10:00:00Z", updatedAt: "2026-07-19T11:00:00Z" };
}
