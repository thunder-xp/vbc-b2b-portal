import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../ProductThumbnail", () => ({ ProductThumbnail: ({ alt }: { alt: string }) => <span aria-label={alt} role="img" /> }));

import { MobileQuickProductCommerce } from "../MobileQuickProductCommerce";

const pricedProduct = {
  id: "product-1",
  sku: "400540",
  name: "DH-C4K-P",
  slug: "dh-c4k-p",
  imageUrl: null,
  categoryId: null,
  categoryName: "Video",
  categorySlug: null,
  matchKind: "exact_sku" as const,
  commercialView: {
    productId: "product-1",
    partnerPrice: { currencyCode: "USD", amount: 50.6, formattedAmount: "$50.60" },
    partnerPriceMdl: { currencyCode: "MDL", amount: 865, formattedAmount: "865 MDL" },
    retailPrice: { currencyCode: "MDL", amount: 1_332, formattedAmount: "1 332 MDL" },
    retailPriceMdl: { currencyCode: "MDL", amount: 1_332, formattedAmount: "1 332 MDL" },
    msrpPriceUsd: { currencyCode: "USD", amount: 75, formattedAmount: "$75.00" },
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
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["ru", "Быстрый подбор товаров", "Покупали ранее", "Избранное"],
    ["ro", "Selecție rapidă de produse", "Cumpărate anterior", "Favorite"],
  ] as const)("renders the concise %s workspace header without competing catalog shortcuts", (locale, title, purchased, favorites) => {
    render(<MobileQuickProductCommerce canSelectProducts locale={locale} />);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: purchased })).toHaveAttribute("href", "/cabinet/opportunities");
    expect(screen.getByRole("link", { name: favorites })).toHaveAttribute("href", "/cabinet/purchasing-lists?filter=favorites");
    expect(screen.queryByText(/Находите товары|Găsiți produse/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Введите или вставьте|Introduceți sau lipiți/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: title })).toHaveClass("[&>a]:min-h-11");
    expect(screen.queryByRole("link", { name: /Открыть каталог|Категории|Deschide catalogul|Categorii/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Живой подбор товаров|Selecție live de produse/)).not.toBeInTheDocument();
  });

  it("debounces representative typing into one request and shows governed commerce data", async () => {
    render(<MobileQuickProductCommerce canSelectProducts locale="ru" />);
    const input = screen.getByRole("searchbox", { name: "Найти товар по SKU или модели" });
    for (const value of ["P", "PF", "PFA", "PFA1", "PFA13", "PFA130-E"]) {
      fireEvent.change(input, { target: { value } });
      await act(() => vi.advanceTimersByTimeAsync(40));
    }
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("$50.60")).toBeInTheDocument();
    expect(screen.getByText("865 MDL")).toBeInTheDocument();
    expect(screen.getByText("Розничная цена")).toBeInTheDocument();
    expect(screen.queryByText("MSRP")).not.toBeInTheDocument();
    expect(screen.getByText("$75.00")).toBeInTheDocument();
    expect(screen.getByText(/1\s332 MDL/)).toBeInTheDocument();
    expect(screen.getByText("В наличии: 492 шт.")).toBeInTheDocument();
    expect(screen.getByText("Точное совпадение")).toBeInTheDocument();
    const arrow = screen.getByRole("link", { name: "Открыть товар" });
    expect(arrow).toHaveAttribute("href", "/cabinet/catalog/dh-c4k-p?returnTo=%2Fcabinet%2Fquick-order");
    expect(arrow).toHaveClass("size-11", "cursor-pointer");
    arrow.focus();
    expect(arrow).toHaveFocus();
  });

  it("ignores an obsolete response after a newer search wins", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(fetchResponse([{ ...pricedProduct, id: "product-2", sku: "400545", name: "NEW-MODEL" }])));
    render(<MobileQuickProductCommerce canSelectProducts locale="ru" />);
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

  it("adds the visible quantity to the shared selection and keeps search ready", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const added = vi.fn();
    window.addEventListener("novotech:live-selection-add", added);
    render(<MobileQuickProductCommerce canSelectProducts locale="ru" />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "400540");
    await screen.findByText("$50.60");
    await user.click(screen.getByRole("button", { name: "Увеличить количество" }));
    await user.click(screen.getByRole("button", { name: "В подборку" }));

    expect(added).toHaveBeenCalledOnce();
    expect((added.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ product: { id: "product-1", sku: "400540" }, quantity: 2 });
    expect(await screen.findByText("Добавлено: 2 шт.")).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("400540");
    expect(screen.queryByRole("link", { name: "Открыть каталог и категории" })).not.toBeInTheDocument();

    fireEvent.paste(input, { clipboardData: { getData: () => "400540" } });
    expect(screen.getByRole("button", { name: "В подборку" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
    window.removeEventListener("novotech:live-selection-add", added);
  });

  it("shows a missing current price truthfully, blocks invalid selection, and has Romanian parity", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([{ ...pricedProduct, commercialView: { ...pricedProduct.commercialView, partnerPrice: null, partnerPriceMdl: null } }])));
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canSelectProducts locale="ro" />);
    await user.type(screen.getByRole("searchbox", { name: "Caută produs după cod sau model" }), "400540");
    expect(await screen.findByText("Preț indisponibil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "În selecție" })).toBeDisabled();
  });

  it("shows RETAIL MDL alone when MSRP USD is missing", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([{
      ...pricedProduct,
      commercialView: { ...pricedProduct.commercialView, msrpPriceUsd: null },
    }])));
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canSelectProducts locale="ru" />);
    await user.type(screen.getByRole("searchbox"), "400540");

    const pricing = await screen.findByTestId("quick-search-pricing");
    expect(pricing).toHaveTextContent("Розничная цена");
    expect(pricing).toHaveTextContent(/1\s332 MDL/);
    expect(pricing).not.toHaveTextContent("$75.00");
    expect(screen.getByText("В наличии: 492 шт.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В подборку" })).toBeEnabled();
  });

  it("shows MSRP USD separately while preserving the truthful missing-RETAIL state in Romanian", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([{
      ...pricedProduct,
      commercialView: { ...pricedProduct.commercialView, retailPriceMdl: null },
    }])));
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canSelectProducts locale="ro" />);
    await user.type(screen.getByRole("searchbox"), "400540");

    const pricing = await screen.findByTestId("quick-search-pricing");
    expect(pricing).toHaveTextContent("Prețul cu amănuntul nu este indicat");
    expect(pricing).not.toHaveTextContent("MSRP");
    expect(pricing).toHaveTextContent("$75.00");
    expect(pricing.textContent).not.toMatch(/\$75\.00\s*\/\s*.*MDL/);
  });

  it("shows a truthful retail-missing state without blocking product selection", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(() => fetchResponse([{
      ...pricedProduct,
      commercialView: {
        ...pricedProduct.commercialView,
        retailPriceMdl: null,
        msrpPriceUsd: null,
      },
    }])));
    const user = userEvent.setup();
    render(<MobileQuickProductCommerce canSelectProducts locale="ru" />);
    await user.type(screen.getByRole("searchbox"), "400540");

    expect(await screen.findByText("Розничная цена не указана")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В подборку" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "Количество" })).toHaveValue(1);
  });

  it("starts with bounded purchased-before products and distinguishes the repeat signal", async () => {
    const previous = [1, 2, 3, 4, 5].map((index) => ({
      ...pricedProduct,
      id: `previous-${index}`,
      sku: `40054${index}`,
      slug: `previous-${index}`,
      matchKind: undefined,
      purchaseCount: index,
      totalQuantity: index * 2,
      lastQuantity: 2,
      lastPurchasedAt: "2026-08-12T10:00:00Z",
      repeatPurchaseDue: index === 1,
    }));
    render(<MobileQuickProductCommerce
      canSelectProducts
      locale="ru"
      previouslyPurchased={{ items: previous, totalCount: 9 }}
    />);

    expect(screen.getByTestId("previously-purchased-section")).toBeInTheDocument();
    expect(screen.getAllByTestId("previously-purchased-card")).toHaveLength(5);
    expect(screen.getAllByText("Пора повторить")).toHaveLength(1);
    expect(screen.getByText("+8 товаров")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes purchased products while searching and restores them when cleared", async () => {
    const previous = [{
      ...pricedProduct,
      id: "previous-1",
      matchKind: undefined,
      purchaseCount: 3,
      totalQuantity: 6,
      lastQuantity: 2,
      lastPurchasedAt: "2026-08-12T10:00:00Z",
      repeatPurchaseDue: false,
    }];
    render(<MobileQuickProductCommerce
      canSelectProducts
      locale="ru"
      previouslyPurchased={{ items: previous, totalCount: 1 }}
    />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "400540" } });
    expect(screen.queryByTestId("previously-purchased-section")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getAllByRole("button", { name: "Очистить поиск" })).toHaveLength(1);
    const clear = screen.getByRole("button", { name: "Очистить поиск" });
    expect(clear).toHaveClass("h-12", "w-12");
    fireEvent.click(clear);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByTestId("previously-purchased-section")).toBeInTheDocument();
  });
});
