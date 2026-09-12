import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../catalog/components/ProductCard", () => ({
  ProductCard: ({ product }: { product: { id: string; name: string } }) => (
    <article data-product-id={product.id}>{product.name}</article>
  ),
}));

import {
  DeferredProductCoBuySection,
  ProductCoBuySection,
} from "../ProductCoBuySection";

const capabilities = {
  canAddToOrder: true,
  canManagePurchasingLists: true,
  canAddToSpecification: true,
  showPrice: true,
  showPartnerPrice: true,
  showRetailPrice: true,
  showStock: true,
  showExactQuantity: true,
  showWarehouseAvailability: true,
  showExpectedArrival: true,
  showProjectPriceEligibility: true,
  showTechnicalDocuments: true,
  showCompatibility: true,
  canAddToProject: true,
};

describe("ProductCoBuySection", () => {
  it("hides completely when no qualified candidates exist", () => {
    const { container } = render(
      <ProductCoBuySection cards={[]} capabilities={capabilities} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("resolves the deferred recommendation result outside the primary PDP", async () => {
    const section = await DeferredProductCoBuySection({
      capabilities,
      resultPromise: Promise.resolve({
        success: true,
        errorCode: null,
        message: "Recommendations loaded.",
        data: cards.slice(0, 2),
      }),
    });

    render(section);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("keeps the deferred section absent for an empty result", async () => {
    await expect(
      DeferredProductCoBuySection({
        capabilities,
        resultPromise: Promise.resolve({
          success: true,
          errorCode: null,
          message: "Recommendations loaded.",
          data: [],
        }),
      }),
    ).resolves.toBeNull();
  });

  it("renders the governed RU title, privacy tooltip, and actual card count", () => {
    render(
      <ProductCoBuySection
        cards={cards.slice(0, 3)}
        capabilities={capabilities}
        locale="ru"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Другие партнёры с этим покупают",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Основано на обезличенной статистике совместных покупок партнёров Novotech.",
      ),
    ).toHaveAttribute(
      "title",
      "Основано на обезличенной статистике совместных покупок партнёров Novotech.",
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByTestId("product-cobuy-section").innerHTML).not.toMatch(
      /confidence|lift|companyCount|orderCount/i,
    );
  });

  it("keeps Romanian parity and deterministic responsive columns", () => {
    render(
      <ProductCoBuySection
        cards={cards}
        capabilities={capabilities}
        locale="ro"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Alți parteneri cumpără împreună cu acest produs",
      }),
    ).toBeInTheDocument();
    const grid = screen.getAllByRole("article")[0]?.parentElement;
    expect(grid).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
      "lg:grid-cols-3",
      "xl:grid-cols-5",
    );
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });
});

const cards = Array.from({ length: 5 }, (_, index) => ({
  id: `${index + 1}1111111-1111-4111-8111-111111111111`,
  sku: `SKU-${index + 1}`,
  name: `Product ${index + 1}`,
  slug: `product-${index + 1}`,
  imageUrl: null,
  imageFit: "contain" as const,
  commercialView: null,
}));
