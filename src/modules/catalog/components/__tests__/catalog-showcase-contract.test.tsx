import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../behavior-analytics/components/BehaviorViewEvent", () => ({
  BehaviorTrackedCatalogLink: ({ ariaLabel, children, href }: { ariaLabel: string; children: React.ReactNode; href: string }) => <a aria-label={ariaLabel} href={href}>{children}</a>,
  BehaviorViewEvent: () => null,
}));
vi.mock("../ProductCard", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article>,
}));

import {
  CatalogMerchandisingSections,
  responsiveShowcaseRemainders,
  showcaseProductVisibilityClass,
} from "../CatalogMerchandisingSections";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "../product-card.model";

describe("partner catalog showcase contract", () => {
  it.each([
    [0, { mobile: 0, tablet: 0, desktop: 0, wide: 0 }],
    [2, { mobile: 1, tablet: 0, desktop: 0, wide: 0 }],
    [5, { mobile: 4, tablet: 3, desktop: 1, wide: 0 }],
    [18, { mobile: 17, tablet: 16, desktop: 14, wide: 13 }],
  ])("calculates exact responsive remainders for total %i", (total, expected) => {
    expect(responsiveShowcaseRemainders(total)).toEqual(expected);
  });

  it("renders at most five cards with one-row breakpoint visibility", () => {
    renderShowcase(18, "ru");
    const cards = screen.getByTestId("catalog-showcase-grid-TOP").querySelectorAll("[data-showcase-product]");
    expect(cards).toHaveLength(5);
    expect(Array.from(cards).map((card) => card.className)).toEqual([
      showcaseProductVisibilityClass(0),
      showcaseProductVisibilityClass(1),
      showcaseProductVisibilityClass(2),
      showcaseProductVisibilityClass(3),
      showcaseProductVisibilityClass(4),
    ]);
    expect(cards[1]).toHaveClass("hidden", "sm:block");
    expect(cards[2]).toHaveClass("hidden", "xl:block");
    expect(cards[4]).toHaveClass("hidden", "2xl:block");
  });

  it("places viewport-specific hidden counts beside the governed Show All link", () => {
    renderShowcase(18, "ru");
    expect(screen.getByLabelText("Ещё товаров: 17")).toHaveClass("sm:hidden");
    expect(screen.getByLabelText("Ещё товаров: 16")).toHaveClass("sm:inline-flex", "xl:hidden");
    expect(screen.getByLabelText("Ещё товаров: 14")).toHaveClass("xl:inline-flex", "2xl:hidden");
    expect(screen.getByLabelText("Ещё товаров: 13")).toHaveClass("2xl:inline-flex");
    expect(screen.getByRole("link", { name: "Показать все: Популярные товары" })).toHaveAttribute("href", "/cabinet/catalog?label=TOP");
  });

  it("renders Romanian remainder copy without changing the destination", () => {
    renderShowcase(6, "ro");
    expect(screen.getByLabelText("Încă 1 produse")).toHaveClass("2xl:inline-flex");
    expect(screen.getByRole("link", { name: "Afișează toate: Populare" })).toHaveAttribute("href", "/cabinet/catalog?label=TOP");
  });
});

function renderShowcase(totalCount: number, locale: "ru" | "ro") {
  return render(<CatalogMerchandisingSections
    capabilities={RESTRICTED_PRODUCT_CARD_CAPABILITIES}
    commercialViews={{}}
    companyId={null}
    locale={locale}
    sections={[{
      labelCode: "TOP",
      title: locale === "ro" ? "Populare" : "Популярные товары",
      products: Array.from({ length: 8 }, (_, index) => ({ id: `product-${index}`, name: `Camera ${index}` } as never)),
      totalCount,
    }]}
    userId={null}
  />);
}
