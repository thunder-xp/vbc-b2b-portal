import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ action: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("../../actions/reorder.actions", () => ({ addHistoricalOrderToCartAction: mocks.action }));
import { HistoricalOrderCartButton } from "../HistoricalOrderCartButton";

const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lineId = "11111111-1111-4111-8111-111111111111";
const result = { cartId: "cart-1", repeated: false, added: 1, updated: 0, changedPrice: 0, missingPrice: 0, unavailable: 0, inactive: 0, skipped: 0, items: [] };

describe("direct historical order cart actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.action.mockResolvedValue({ success: true, data: result }); });

  it("adds the whole order in one action and navigates directly to the cart", async () => {
    render(<HistoricalOrderCartButton orderId={orderId} locale="ru" />);
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/cabinet/cart"));
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith({ orderId, requestKey: expect.any(String) });
  });

  it("adds one row with an accessible icon, retains the detail page and sends no price/quantity", async () => {
    render(<HistoricalOrderCartButton orderId={orderId} lineId={lineId} compact locale="ro" />);
    const button = screen.getByRole("button", { name: "În coș" });
    expect(button).toHaveAttribute("title", "În coș");
    expect(button.querySelector("svg")).toHaveClass("lucide-shopping-cart");
    await userEvent.click(button);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith({ orderId, lineId, requestKey: expect.any(String) });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps partial failures visible by product identity without an intermediate review page", async () => {
    mocks.action.mockResolvedValue({ success: true, data: { ...result, skipped: 1, items: [{ lineId, sku: "SKU-X", productName: "Camera X", result: "skipped" }] } });
    render(<HistoricalOrderCartButton orderId={orderId} locale="ru" />);
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(await screen.findByText(/Camera X \(SKU-X\)/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Открыть корзину" })).toHaveAttribute("href", "/cabinet/cart");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key when retrying an unsuccessful attempt", async () => {
    mocks.action.mockResolvedValueOnce({ success: false });
    render(<HistoricalOrderCartButton orderId={orderId} locale="ru" />);
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    await screen.findByText("Не удалось добавить в корзину. Повторите попытку.");
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
    expect(mocks.action.mock.calls[0][0].requestKey).toBe(mocks.action.mock.calls[1][0].requestKey);
  });
});
