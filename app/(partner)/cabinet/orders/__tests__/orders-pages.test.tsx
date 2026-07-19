import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrderDetailPage from "../[id]/page";
import OrdersPage from "../page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), refresh: vi.fn(), notFound: vi.fn() }));

vi.mock("@/src/modules/orders/actions", () => ({
  listPartnerOrderHistoryAction: mocks.list,
  getPartnerOrderHistoryAction: mocks.get,
  refreshPartnerOrderHistoryAction: mocks.refresh,
}));
vi.mock("@/src/modules/orders/actions/order.actions", () => ({ refreshPartnerOrderHistoryAction: mocks.refresh }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const summary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  primaryLabel: "№ NSUU-001",
  statusLabel: "Открыт",
  posted: true,
  documentDate: "2026-07-15T10:00:00Z",
  deliveryDate: "2026-08-01",
  documentTotal: "1 000,00 MDL",
  positionCount: 2,
  totalUnitCount: 5,
  lastSynchronizedAt: "2026-07-15T10:01:00Z",
  freshness: { status: "fresh", updatedAt: "2026-07-15T10:01:00Z", label: "Обновлено 8 минут назад", staleNotice: null },
};

describe("partner order history pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue({ success: true, data: null, errorCode: null, message: "" });
  });

  it("renders posted 1C history with exact state and current MDL total", async () => {
    mocks.list.mockResolvedValue({
      success: true,
      data: { orders: [summary], filter: "all", search: "", page: 1, totalPages: 1, total: 1, syncState: null, freshness: summary.freshness },
      errorCode: null,
      message: "",
    });

    render(await OrdersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: /NSUU-001/ })).toHaveAttribute("href", `/cabinet/orders/${summary.id}`);
    expect(screen.getAllByText("Открыт")).toHaveLength(2);
    expect(screen.getByText("1 000,00 MDL")).toBeInTheDocument();
    expect(screen.getByText(/2 поз.*5 ед/)).toBeInTheDocument();
    expect(screen.getByText("Планируемая отгрузка")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Повторить заказ" })).toHaveAttribute("href", `/cabinet/orders/${summary.id}/reorder`);
  });

  it("does not expose the internal number as the primary label for an unposted order", async () => {
    mocks.list.mockResolvedValue({
      success: true,
      data: { orders: [{ ...summary, primaryLabel: "Заказ обрабатывается", statusLabel: "Обрабатывается", posted: false }], filter: "processing", search: "", page: 1, totalPages: 1, total: 1, syncState: null, freshness: summary.freshness },
      errorCode: null,
      message: "",
    });

    render(await OrdersPage({ searchParams: Promise.resolve({ status: "processing" }) }));

    expect(screen.getByText("Заказ обрабатывается")).toBeInTheDocument();
    expect(screen.queryByText("№ NSUU-001")).not.toBeInTheDocument();
  });

  it("renders historical detail without requiring a portal snapshot", async () => {
    mocks.get.mockResolvedValue({
      success: true,
      data: {
        ...summary,
        companyName: "ALERT-SS SRL",
        originLabel: "Заказ из истории Novotech",
        lines: [{ productName: "Camera", sku: "400691", quantity: 2, unitPrice: "500,00 MDL", lineTotal: "1 000,00 MDL" }],
        timeline: [{ label: "Импортирован из истории 1С", occurredAt: "2026-07-15T10:01:00Z" }],
        portalSnapshot: null,
      },
      errorCode: null,
      message: "",
    });

    render(await OrderDetailPage({ params: Promise.resolve({ id: summary.id }) }));

    expect(screen.getByRole("heading", { name: "№ NSUU-001" })).toBeInTheDocument();
    expect(screen.getByText("Заказ из истории Novotech")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.queryByText("Снимок при отправке из платформы")).not.toBeInTheDocument();
    expect(screen.getByText("Планируемая отгрузка")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Купить снова" })).toHaveAttribute("href", `/cabinet/orders/${summary.id}/reorder`);
  });

  it("returns safe not-found behavior for an inaccessible deleted order", async () => {
    mocks.get.mockResolvedValue({ success: false, data: null, errorCode: "NOT_FOUND", message: "" });
    mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });

    await expect(OrderDetailPage({ params: Promise.resolve({ id: summary.id }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
