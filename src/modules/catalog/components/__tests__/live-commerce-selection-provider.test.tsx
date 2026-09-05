import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addToCart: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("../../../orders/actions/cart.actions", () => ({ addSelectionToCartAction: mocks.addToCart }));
vi.mock("../../actions/live-commerce-selection.action", () => ({ refreshLiveCommerceSelectionAction: mocks.refresh }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../ProductThumbnail", () => ({ ProductThumbnail: ({ alt }: { alt: string }) => <span aria-label={alt} role="img" /> }));

import { emitLiveCommerceSelectionAdd, LIVE_COMMERCE_SELECTION_STORAGE_KEY, type LiveCommerceSelectionProduct } from "../../services/live-commerce-selection";
import { LiveCommerceSelectionProvider } from "../LiveCommerceSelectionProvider";

const product: LiveCommerceSelectionProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "400540",
  name: "DH-C4K-P",
  slug: "dh-c4k-p",
  imageUrl: null,
  partnerPrice: { amount: 52.9, currencyCode: "USD", formattedAmount: "$52.90", lastUpdatedAt: null },
  stock: { status: "in_stock", label: "Available", exactAvailableQuantity: 487, lastUpdatedAt: null },
};

function Workspace() {
  return <LiveCommerceSelectionProvider canAddToCart canCreateEstimate><button onClick={() => emitLiveCommerceSelectionAdd({ product, quantity: 2 })} type="button">Add camera</button></LiveCommerceSelectionProvider>;
}

describe("LiveCommerceSelectionProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.addToCart.mockReset().mockResolvedValue({ success: true, data: { cartId: "cart-1", added: 1, updated: 0, priceChanged: 0, missingPrice: 0 }, message: "ok" });
    mocks.refresh.mockReset().mockResolvedValue({ success: true, data: [product], message: "ok" });
    mocks.push.mockReset();
  });

  it("persists, merges, edits, and removes a temporary selection", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole("button", { name: "Add camera" }));
    await user.click(screen.getByRole("button", { name: "Add camera" }));
    expect(await screen.findByText(/1 товаров/)).toBeInTheDocument();
    expect(screen.getByText(/4 шт/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY) ?? "[]")[0]).toMatchObject({ id: product.id, quantity: 4 }));

    await user.click(screen.getByRole("button", { name: "Открыть" }));
    const quantity = await screen.findByRole("spinbutton", { name: `Количество: ${product.name}` });
    fireEvent.change(quantity, { target: { value: "7" } });
    expect(quantity).toHaveValue(7);
    await user.click(screen.getByRole("button", { name: `Удалить: ${product.name}` }));
    expect(screen.queryByTestId("live-selection-bar")).not.toBeInTheDocument();
  });

  it("sends one bounded Cart mutation and clears after success", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole("button", { name: "Add camera" }));
    await user.click(screen.getByRole("button", { name: "Открыть" }));
    await user.click(await screen.findByRole("button", { name: "В корзину" }));
    await waitFor(() => expect(mocks.addToCart).toHaveBeenCalledWith([{ productId: product.id, quantity: 2, snapshotPartnerPrice: 52.9 }]));
    expect(mocks.push).toHaveBeenCalledWith("/cabinet/cart");
    expect(sessionStorage.getItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY)).toBeNull();
  });

  it("keeps the mobile bar safe-area aware and exposes the standard Estimate route", async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole("button", { name: "Add camera" }));
    expect(screen.getByTestId("live-selection-bar")).toHaveClass("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
    await user.click(screen.getByRole("button", { name: "Открыть" }));
    expect(await screen.findByRole("link", { name: "Создать КП" })).toHaveAttribute("href", "/cabinet/estimates/new?source=selection");
  });
});
