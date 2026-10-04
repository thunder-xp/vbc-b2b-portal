import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignCard, CampaignCartControl, CampaignPriceStack } from "..";

vi.mock("../../actions", () => ({ addCampaignItemToCartAction: vi.fn() }));

const product = { itemId: "item-1", productId: "product-1", sku: "400123", name: "Camera", slug: "camera", imageUrl: "/camera.webp", minimumQuantity: 2, maximumQuantityPerCompany: 10, partnerMessage: null, mechanicType: "legacy_promo" as const, promoThresholdQuantity: null, msrpPrice: { amount: 120, currency: "USD" }, partnerPrice: { amount: 100, currency: "USD" }, specialPrice: { amount: 90, currency: "USD" }, price: { amount: 100, currency: "USD" }, availableQuantity: 5, expectedArrivalDate: null };
const campaign = { id: "campaign-1", code: "TEST", title: "Предложение для вашей компании", description: "Актуальное предложение Novotech", type: "product_offer" as const, startsAt: "2026-07-31T00:00:00Z", endsAt: "2026-08-10T00:00:00Z", priority: 1, imageAssetPath: "/offer.webp", termsSummary: "Текущая цена", mechanicType: "legacy_promo" as const, products: [product] };

describe("commercial campaign UI", () => {
  it("renders partner-safe validity, availability and CTA", () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText("Специальное предложение")).toBeInTheDocument();
    expect(screen.getByText(/Доступно до/)).toBeInTheDocument();
    expect(screen.getByText("В наличии: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть предложение" })).toHaveAttribute("href", "/cabinet/offers/campaign-1");
  });

  it("uses accessible 44px quantity and cart controls", () => {
    render(<CampaignCartControl itemId="item-1" maximum={10} mechanicType="legacy_promo" minimum={2} promoPrice={product.specialPrice} promoThresholdQuantity={null} />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveValue(2);
    expect(screen.getByRole("button", { name: /Добавить в корзину/ })).toHaveClass("min-h-11");
  });

  it("explains progress to the governed per-product PROMO threshold", () => {
    render(<CampaignCartControl itemId="item-1" maximum={10} mechanicType="quantity_threshold_promo" minimum={1} promoPrice={product.specialPrice} promoThresholdQuantity={5} />);
    expect(screen.getByText("Добавьте ещё 4 шт., чтобы получить PROMO.")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-promo-eligibility")).toHaveClass("text-zinc-600");
  });

  it("renders the governed three-line USD stack and omits unavailable special pricing", () => {
    const { rerender } = render(<CampaignPriceStack locale="ru" product={product} />);
    expect(screen.getByText("MSRP")).toBeInTheDocument();
    expect(screen.getByText("Ваша цена")).toBeInTheDocument();
    expect(screen.getByText("Спеццена")).toBeInTheDocument();
    expect(screen.getAllByText(/\$/)).toHaveLength(3);
    rerender(<CampaignPriceStack locale="ru" product={{ ...product, specialPrice: null }} />);
    expect(screen.queryByText("Спеццена")).not.toBeInTheDocument();
  });

  it("labels the governed PROMO price with its product threshold", () => {
    render(<CampaignPriceStack locale="ru" product={{ ...product, mechanicType: "quantity_threshold_promo", promoThresholdQuantity: 5 }} />);
    expect(screen.getByText("От 5 шт. · PROMO")).toBeInTheDocument();
  });

  it("fits the campaign artwork without cropping", () => {
    const { container } = render(<CampaignCard campaign={campaign} />);
    expect(container.querySelector("img")).toHaveClass("object-contain");
  });
});
