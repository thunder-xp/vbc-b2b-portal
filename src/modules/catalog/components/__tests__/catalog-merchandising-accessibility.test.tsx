import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../behavior-analytics/components/BehaviorViewEvent", () => ({
  BehaviorTrackedCatalogLink: ({ ariaLabel, children, href }: { ariaLabel: string; children: React.ReactNode; href: string }) => <a aria-label={ariaLabel} href={href}>{children}</a>,
}));
vi.mock("../../behavior-analytics/components", () => ({
  BehaviorViewEvent: () => null,
}));
vi.mock("../ProductCard", () => ({
  ProductCard: ({ contextBadge, product }: { contextBadge?: string; product: { name: string } }) => <div>{product.name}{contextBadge ? <span>{contextBadge}</span> : null}</div>,
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

  it("localizes the replenishment title, badge, and action in Romanian", () => {
    render(<CatalogMerchandisingSections
      capabilities={RESTRICTED_PRODUCT_CARD_CAPABILITIES}
      commercialViews={{}}
      companyId={null}
      locale="ro"
      sections={[{
        contextBadge: "Пополнение",
        href: "/cabinet/catalog?collection=replenishment",
        labelCode: "REPLENISHMENT",
        title: "Последнее поступление",
        products: [{ id: "product", name: "Camera" } as never],
      }]}
      userId={null}
    />);
    expect(screen.getByRole("heading", { name: "Ultima aprovizionare" })).toBeInTheDocument();
    expect(screen.getByText("Aprovizionare")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Afișează toate: Ultima aprovizionare" })).toHaveAttribute(
      "href",
      "/cabinet/catalog?collection=replenishment",
    );
  });
});
