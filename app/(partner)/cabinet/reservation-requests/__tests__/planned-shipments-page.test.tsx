import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlannedShipmentsPage from "../page";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/src/modules/orders/actions", () => ({ listPlannedShipmentsAction: mocks.list }));

describe("PlannedShipmentsPage", () => {
  it("shows active and overdue orders from the order read model", async () => {
    mocks.list.mockResolvedValue({ success: true, errorCode: null, message: "", data: { shipments: [shipment("future", "scheduled", "Запланировано"), shipment("overdue", "overdue", "Дата прошла")], page: 1, totalPages: 1, total: 2 } });

    render(await PlannedShipmentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Планируемые отгрузки" })).toBeInTheDocument();
    expect(screen.getByText("Запланировано")).toBeInTheDocument();
    expect(screen.getByText("Дата прошла")).toBeInTheDocument();
    expect(screen.getAllByText(/2 поз.*5 ед/)).toHaveLength(2);
    expect(mocks.list).toHaveBeenCalledWith({ page: null });
  });
});

function shipment(id: string, dateIndicator: "scheduled" | "overdue", dateIndicatorLabel: string) {
  return { id, primaryLabel: `№ ${id}`, statusLabel: "Открыт", posted: true, documentDate: "2026-07-19T10:00:00Z", deliveryDate: "2026-07-25", documentTotal: "100,00 MDL", positionCount: 2, totalUnitCount: 5, lastSynchronizedAt: "2026-07-19T11:00:00Z", freshness: { status: "fresh", updatedAt: "2026-07-19T11:00:00Z", label: "Обновлено", staleNotice: null }, daysRemaining: 5, dateIndicator, dateIndicatorLabel };
}
