import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addToCart, recordInteraction } = vi.hoisted(() => ({
  addToCart: vi.fn(),
  recordInteraction: vi.fn(),
}));

vi.mock("../../../orders/actions/cart.actions", () => ({ addToCartAction: addToCart }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: recordInteraction }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../ProductThumbnail", () => ({ ProductThumbnail: ({ alt }: { alt: string }) => <span aria-label={alt} role="img" /> }));

import { MobileQuickProductCommerce } from "../MobileQuickProductCommerce";

const pricedProduct = {
  id: "product-1",
  sku: "400540",
  name: "DH-C4K-P",
  slug: "dh-c4k-p",
  imageUrl: null,
  categoryName: "Video",
  matchKind: "exact_sku" as const,
  commercialView: {
    productId: "product-1",
    partnerPrice: { currencyCode: "USD", amount: 50.6, formattedAmount: "$50.60" },
    partnerPriceMdl: { currencyCode: "MDL", amount: 865, formattedAmount: "865 MDL" },
    retailPrice: null,
    stock: { status: "in_stock" as const, exactAvailableQuantity: 492, exactPhysicalQuantity: 500, exactReservedQuantity: 8, exactIncomingQuantity: 0, expectedArrival: null, hasVariantStock: false, lastUpdatedAt: "2026-09-04T00:00:00Z", label: "" },
    isDemoData: false,
  },
};

function fetchResponse(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => ({ success: true, data }) });
}

describe("mobile quick product commerce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([pricedProduct])));
    addToCart.mockReset();
    addToCart.mockResolvedValue({ success: true, data: null, message: "ok" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces representative typing into one request and shows governed commerce data", async () => {
    render(<MobileQuickProductCommerce canAddToOrder initialCartQuantities={{}} initialCartUnitCount={0} locale="ru" />);
    const input = screen.getByRole("searchbox", { name: "Найти товар по SKU или модели" });
    for (const value of ["P", "PF", "PFA", "PFA1", "PFA13", "PFA130-E"]) {
      fireEvent.change(input, { target: { value } });
      await act(() => vi.advanceTimersByTimeAsync(40));
    }
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("$50.60")).toBeInTheDocument();
    expect(screen.getByText("865 MDL")).toBeInTheDocument();
    expect(screen.getByText("В наличии: 492 шт.")).toBeInTheDocument();
    expect(screen.getByText("Точное совпадение")).toBeInTheDocument();
  });

  it("ignores an obsolete response after a newer search wins", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(fetchResponse([{ ...pricedProduct, id: "product-2", sku: "400545", name: "NEW-MODEL" }])));
    render(<MobileQuickProductCommerce canAddToOrder initialCartQuantities={{}} initialCartUnitCount={0} locale="ru" />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "400540" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.change(input, { target: { value: "400545" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("NEW-MODEL")).toBeInTheDocument();

    resolveFirst({ ok: true, json: async () => ({ success: true, data: [pricedProduct] }) });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("DH-C4K-P")).not.toBeInTheDocument();
  });

  it("increments an existing cart line through the canonical action and keeps search ready", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canAddToOrder initialCartQuantities={{ "product-1": 3 }} initialCartUnitCount={3} locale="ru" />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "400540");
    expect(await screen.findByText("В корзине: 3 шт.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Увеличить количество" }));
    await user.click(screen.getByRole("button", { name: "В корзину" }));

    expect(addToCart).toHaveBeenCalledWith("product-1", 2);
    expect(await screen.findByText("В корзине: 5 шт.")).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("400540");
    expect(screen.getByRole("link", { name: "Корзина: 5" })).toHaveAttribute("href", "/cabinet/cart");
  });

  it("shows missing price without enabling a false-priced add and has Romanian parity", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([{ ...pricedProduct, commercialView: { ...pricedProduct.commercialView, partnerPrice: null, partnerPriceMdl: null } }])));
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canAddToOrder initialCartQuantities={{}} initialCartUnitCount={0} locale="ro" />);
    await user.type(screen.getByRole("searchbox", { name: "Caută produs după cod sau model" }), "400540");
    expect(await screen.findByText("Preț indisponibil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "În coș" })).toBeDisabled();
  });
});
