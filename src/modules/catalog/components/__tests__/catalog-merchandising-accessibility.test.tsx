import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../behavior-analytics/components/BehaviorViewEvent", () => ({
  BehaviorTrackedCatalogLink: ({ ariaLabel, children, href }: { ariaLabel: string; children: React.ReactNode; href: string }) => <a aria-label={ariaLabel} href={href}>{children}</a>,
}));
vi.mock("../../behavior-analytics/components", () => ({
  BehaviorViewEvent: () => null,
}));
vi.mock("../ProductCard", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));

import { CatalogMerchandisingSections } from "../CatalogMerchandisingSections";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "../product-card.model";

describe("CatalogMerchandisingSections accessibility", () => {
  it("gives each section action a specific accessible name and hides empty sections upstream", () => {
    render(<CatalogMerchandisingSections
      capabilities={RESTRICTED_PRODUCT_CARD_CAPABILITIES}
      commercialViews={{}}
      companyId={null}
      sections={[{
        labelCode: "TOP",
        title: "Популярные товары",
        products: [{ id: "product", name: "Camera" } as never],
      }]}
      userId={null}
    />);
    expect(screen.getByRole("heading", { name: "Популярные товары" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Показать все: Популярные товары" })).toHaveAttribute(
      "href",
      "/cabinet/catalog?label=TOP",
    );
  });
});
