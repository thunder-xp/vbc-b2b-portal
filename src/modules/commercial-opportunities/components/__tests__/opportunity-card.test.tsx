import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CommercialOpportunity } from "../../types";
import { OpportunityCard } from "../OpportunityCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({ dismissCommercialOpportunityAction: vi.fn() }));
vi.mock("../../../orders/actions", () => ({ addToCartAction: vi.fn() }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: vi.fn() }));

const base: CommercialOpportunity = {
  id: "7f243182-f24b-4f0a-a4b0-f8b291564dc9", type: "repeat_purchase_available", priority: 60,
  reasonCode: "repeat_purchase", reasonMetadata: { purchaseCount: 4, lastPurchasedAt: "2026-07-20T00:00:00Z", typicalQuantity: 2 },
  secondaryReasons: ["relevant_merchandising"], fingerprint: "a".repeat(64), firstDetectedAt: "2026-07-31T00:00:00Z", lastConfirmedAt: "2026-07-31T00:00:00Z", sourceType: "product", sourceId: "product-1",
  product: { id: "product-1", sku: "400123", name: "Camera", slug: "camera", imageUrl: null, categoryName: "Cameras", partnerPrice: { amount: 97.44, currency: "USD" }, retailPrice: { amount: 2399, currency: "MDL" }, availableQuantity: 12, expectedArrivalDate: null, expectedArrivalQuantity: null }, template: null,
};

describe("OpportunityCard", () => {
  it("explains relevance and keeps the canonical primary action", () => {
    render(<OpportunityCard opportunity={base} />);
    expect(screen.getByText("Можно повторить закупку")).toBeInTheDocument();
    expect(screen.getByText(/Вы покупали этот товар 4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Не показывать/ })).toBeInTheDocument();
  });

  it("renders only the permitted price serialized by the server", () => {
    const retailOnly = { ...base, product: { ...base.product!, partnerPrice: null } };
    render(<OpportunityCard opportunity={retailOnly} />);
    expect(screen.getByText("Розничная цена")).toBeInTheDocument();
    expect(screen.queryByText("Ваша цена")).not.toBeInTheDocument();
  });

  it("renders confirmed arrival without relying on color", () => {
    render(<OpportunityCard opportunity={{ ...base, type: "relevant_product_arrival_confirmed", reasonCode: "confirmed_arrival", reasonMetadata: { expectedDate: "2026-08-17", expectedQuantity: 140 }, product: { ...base.product!, availableQuantity: 0, expectedArrivalDate: "2026-08-17", expectedArrivalQuantity: 140 } }} />);
    expect(screen.getByText(/Поступление 140 шт/)).toBeInTheDocument();
    expect(screen.getByText("Поступление")).toBeInTheDocument();
  });

  it("renders template readiness as a separate actionable opportunity", () => {
    render(<OpportunityCard opportunity={{ ...base, product: null, template: { id: "template-1", name: "Monthly CCTV" }, type: "purchase_template_ready", reasonCode: "template_fully_ready", reasonMetadata: { itemCount: 8 }, sourceType: "purchase_template", sourceId: "template-1" }} />);
    expect(screen.getByText("Все 8 позиций шаблона доступны.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Проверить шаблон/ })).toHaveAttribute("href", "/cabinet/purchase-templates/template-1");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the canonical medium thumbnail from the product reference", () => {
    render(<OpportunityCard opportunity={{
      ...base,
      product: {
        ...base.product!,
        reference: {
          productId: "product-1",
          slug: "camera",
          sku: "400123",
          name: "Camera",
          thumbnail: "/products/camera.jpg",
          thumbnailFit: "contain",
          publicationState: "published",
        },
      },
    }} />);
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("src", expect.stringContaining("camera.jpg"));
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("data-product-thumbnail", "md");
  });

  it("uses the controlled placeholder for an unmapped product image", () => {
    render(<OpportunityCard opportunity={base} />);
    expect(screen.getByRole("img", { name: "Camera, 400123" })).toHaveAttribute("src", expect.stringContaining("/product-placeholder.svg"));
  });
});
