import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), prepare: vi.fn() }));

vi.mock("../../../orders/actions/repeat-order-selection.actions", () => ({
  getRepeatOrderSelectionPreviewAction: mocks.preview,
  prepareRepeatOrderSelectionAction: mocks.prepare,
}));
vi.mock("../ProductThumbnail", () => ({ ProductThumbnail: () => <span role="img" /> }));

import { RepeatOrderSelectionSection } from "../RepeatOrderSelectionSection";

const order = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderLabel: "№ TEST-10",
  documentDate: "2026-08-12T00:00:00Z",
  productCount: 2,
  unitCount: 5,
};
const readyProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "400540",
  name: "Ready camera",
  slug: "ready-camera",
  imageUrl: null,
  partnerPrice: { amount: 50, currencyCode: "USD", formattedAmount: "$50.00", lastUpdatedAt: "2026-09-05T00:00:00Z" },
  stock: { status: "in_stock" as const, label: "Available", exactAvailableQuantity: 12, lastUpdatedAt: "2026-09-05T00:00:00Z" },
};
const preview = {
  orderId: order.id,
  orderLabel: order.orderLabel,
  readyCount: 1,
  attentionCount: 1,
  lines: [
    { lineId: "11111111-1111-4111-8111-111111111111", productId: readyProduct.id, productName: readyProduct.name, sku: readyProduct.sku, imageUrl: null, historicalQuantity: 3, status: "READY" as const, currentPrice: "$50.00", currentStock: 12, product: readyProduct },
    { lineId: "22222222-2222-4222-8222-222222222222", productId: "product-2", productName: "Missing camera", sku: "400541", imageUrl: null, historicalQuantity: 2, status: "PRICE_UNAVAILABLE" as const, currentPrice: null, currentStock: 4, product: null },
  ],
};

describe("repeat order selection section", () => {
  beforeEach(() => {
    mocks.preview.mockReset().mockResolvedValue({ success: true, data: preview });
    mocks.prepare.mockReset().mockResolvedValue({ success: true, data: { items: [{ product: readyProduct, quantity: 3 }], readyCount: 1, attentionCount: 0 } });
  });

  it("loads a selected composition lazily and exposes current truth per line", async () => {
    const user = userEvent.setup();
    render(<RepeatOrderSelectionSection canSelectProducts initialOrderId={null} locale="ru" orders={[order]} />);
    expect(mocks.preview).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Использовать товары" }));

    expect(await screen.findByRole("dialog", { name: "Состав заказа" })).toBeInTheDocument();
    expect(screen.getByText("Готово")).toBeInTheDocument();
    expect(screen.getAllByText("Цена недоступна")).toHaveLength(2);
    expect(screen.getByRole("spinbutton", { name: "Количество: Ready camera" })).toHaveValue(3);
    expect(screen.getByRole("spinbutton", { name: "Количество: Missing camera" })).toBeDisabled();
  });

  it("rechecks once and applies one local batch without Cart mutation", async () => {
    const user = userEvent.setup();
    const batch = vi.fn();
    window.addEventListener("novotech:live-selection-add-batch", batch);
    render(<RepeatOrderSelectionSection canSelectProducts initialOrderId={order.id} locale="ro" orders={[order]} />);

    await screen.findByRole("dialog", { name: "Componența comenzii" });
    await user.click(screen.getByRole("button", { name: "Folosește produsele disponibile" }));

    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
    expect(mocks.prepare).toHaveBeenCalledWith({
      orderId: order.id,
      lines: [{ lineId: preview.lines[0].lineId, quantity: 3 }],
    });
    expect(batch).toHaveBeenCalledOnce();
    expect((batch.mock.calls[0]?.[0] as CustomEvent).detail.items).toEqual([{ product: readyProduct, quantity: 3 }]);
    window.removeEventListener("novotech:live-selection-add-batch", batch);
  });
});
