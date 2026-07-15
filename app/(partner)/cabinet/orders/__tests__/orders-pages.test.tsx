import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrderDetailPage from "../[id]/page";
import OrdersPage from "../page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), notFound: vi.fn() }));

vi.mock("@/src/modules/orders/actions", () => ({
  listPartnerOrdersAction: mocks.list,
  getPartnerOrderAction: mocks.get,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const summary = {
  id: "order-1",
  status: "submitted",
  external1cNumber: "NSUU-001",
  requestedDeliveryDate: "2026-08-01",
  submittedAt: "2026-07-15T10:00:00Z",
  createdAt: "2026-07-15T09:59:00Z",
  confirmedAt: "2026-07-15T10:00:00Z",
  integrationStatus: "confirmed",
  oneCOrderStatus: "unposted",
  documentTotal: "100,00 $",
  currencyCode: "USD",
  positionCount: 2,
  totalUnitCount: 5,
};

describe("partner order pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the current company order summary with totals and counts", async () => {
    mocks.list.mockResolvedValue({ success: true, data: [summary], errorCode: null, message: "" });

    render(await OrdersPage());

    expect(screen.getByRole("link", { name: /NSUU-001/ })).toHaveAttribute("href", "/cabinet/orders/order-1");
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
    expect(screen.getByText(/2 поз.*5 ед/)).toBeInTheDocument();
  });

  it("renders confirmed success and every immutable order line without raw references", async () => {
    mocks.get.mockResolvedValue({
      success: true,
      data: {
        ...summary,
        companyName: "ALERT-SS SRL",
        contractNumber: "NS-296/0302/20",
        lastSynchronizedAt: "2026-07-15T10:00:00Z",
        lines: [
          { productName: "Camera", sku: "400691", quantity: 2, unitPrice: "20,00 $", lineTotal: "40,00 $" },
          { productName: "Recorder", sku: "400525", quantity: 3, unitPrice: "20,00 $", lineTotal: "60,00 $" },
        ],
      },
      errorCode: null,
      message: "",
    });

    render(await OrderDetailPage({ params: Promise.resolve({ id: "order-1" }) }));

    expect(screen.getByRole("heading", { name: "Заказ успешно создан" })).toBeInTheDocument();
    expect(screen.getByText(/Ваш заказ № NSUU-001/)).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Recorder")).toBeInTheDocument();
    expect(screen.getByText("NS-296/0302/20")).toBeInTheDocument();
    expect(screen.queryByText(/77777777-7777/)).not.toBeInTheDocument();
  });
});
