import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  prepare: vi.fn(),
  update: vi.fn(),
  updateMetadata: vi.fn(),
  archive: vi.fn(),
  dispatch: vi.spyOn(window, "dispatchEvent"),
}));

vi.mock("../../actions", () => ({
  createLiveCommerceKitAction: mocks.create,
  getLiveCommerceKitAction: mocks.get,
  listLiveCommerceKitsAction: mocks.list,
  prepareLiveCommerceKitSelectionAction: mocks.prepare,
  updateLiveCommerceKitAction: mocks.update,
  updatePurchasingListMetadataAction: mocks.updateMetadata,
  setPurchasingListArchivedAction: mocks.archive,
}));
vi.mock("../../../catalog/components/ProductThumbnail", () => ({ ProductThumbnail: () => <span role="img" /> }));

import { SavedKitsSection } from "../SavedKitsSection";
import type { LiveCommerceKitDetailDto, LiveCommerceKitSummaryDto } from "../../types";

const KIT = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "55555555-5555-4555-8555-555555555555";
const summary: LiveCommerceKitSummaryDto = { id: KIT, name: "CCTV 8", itemCount: 1, totalQuantity: 2, updatedAt: "2026-09-05T10:00:00Z", revision: 1, canManage: true };
const detail: LiveCommerceKitDetailDto = {
  ...summary,
  description: null,
  visibility: "private",
  readyCount: 1,
  attentionCount: 0,
  lines: [{
    itemId: ITEM, productId: PRODUCT, productName: "Camera", sku: "400691", imageUrl: null,
    quantity: 2, position: 1, status: "READY", currentPrice: "$10.00", currentStock: 5,
    product: { id: PRODUCT, name: "Camera", sku: "400691", slug: "camera", imageUrl: null, partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00", lastUpdatedAt: null }, stock: { status: "in_stock", label: "Available", exactAvailableQuantity: 5, lastUpdatedAt: null } },
  }],
};

describe("SavedKitsSection", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ success: true, data: { id: KIT, saved: 1, skipped: 0 } });
    mocks.get.mockReset().mockResolvedValue({ success: true, data: detail });
    mocks.list.mockReset().mockResolvedValue({ success: true, data: [summary] });
    mocks.prepare.mockReset().mockResolvedValue({ success: true, data: { items: [{ product: detail.lines[0].product, quantity: 4 }], readyCount: 1, attentionCount: 0 } });
    mocks.update.mockReset().mockResolvedValue({ success: true, data: { id: KIT, revision: 2 } });
    mocks.updateMetadata.mockReset().mockResolvedValue({ success: true, data: { revision: 2 } });
    mocks.archive.mockReset().mockResolvedValue({ success: true, data: { revision: 2 } });
    mocks.dispatch.mockClear();
  });

  it("shows compact summaries without prices and resolves current truth only after open", async () => {
    render(<SavedKitsSection canManage canSelectProducts initialKitId={null} initialKits={[summary]} locale="ru" />);
    expect(screen.getByText("CCTV 8")).toBeInTheDocument();
    expect(screen.queryByText("$10.00")).not.toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
    expect(await screen.findByText("$10.00")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(KIT);
  });

  it("preserves quantities, updates deliberately, and imports through one additive batch event", async () => {
    render(<SavedKitsSection canManage canSelectProducts initialKitId={null} initialKits={[summary]} locale="ru" />);
    await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
    const quantity = await screen.findByRole("spinbutton", { name: "Количество: Camera" });
    fireEvent.change(quantity, { target: { value: "4" } });
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ listId: KIT, expectedRevision: 1, items: [{ itemId: ITEM, quantity: 4 }] }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Использовать комплект" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Использовать комплект" }));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith({ listId: KIT, items: [{ itemId: ITEM, quantity: 4 }] }));
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "novotech:live-selection-add-batch" }));
  });

  it("supports save-as-new and Romanian copy", async () => {
    render(<SavedKitsSection canManage canSelectProducts initialKitId={null} initialKits={[summary]} locale="ro" />);
    expect(screen.getByRole("heading", { name: "Seturile mele" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deschide" }));
    await userEvent.click(await screen.findByRole("button", { name: "Salvează ca set nou" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Denumirea setului nou" }), "Set nou");
    await userEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: "Set nou", items: [{ productId: PRODUCT, quantity: 2 }] }));
  });

  it("renders the guided empty state", () => {
    render(<SavedKitsSection canManage canSelectProducts initialKitId={null} initialKits={[]} locale="ru" />);
    expect(screen.getByText("Вы ещё не сохранили ни одного комплекта.")).toBeInTheDocument();
  });

  it("uses the canonical labels and icon-backed management actions", async () => {
    render(<SavedKitsSection canManage canSelectProducts initialKitId={null} initialKits={[summary]} locale="ru" />);
    await userEvent.click(screen.getByRole("button", { name: "Открыть" }));
    expect(await screen.findByRole("button", { name: "Использовать комплект" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить как новый" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Переименовать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Архивировать" })).toBeInTheDocument();
  });
});
