import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignCard, CampaignCartControl } from "..";

vi.mock("../../actions", () => ({ addCampaignItemToCartAction: vi.fn() }));

const campaign = { id: "campaign-1", code: "TEST", title: "Предложение для вашей компании", description: "Актуальное предложение Novotech", type: "product_offer" as const, startsAt: "2026-07-31T00:00:00Z", endsAt: "2026-08-10T00:00:00Z", priority: 1, imageAssetPath: null, termsSummary: "Текущая цена", products: [{ itemId: "item-1", productId: "product-1", sku: "400123", name: "Camera", slug: "camera", imageUrl: null, minimumQuantity: 2, maximumQuantityPerCompany: 10, partnerMessage: null, price: null, availableQuantity: 5, expectedArrivalDate: null }] };

describe("commercial campaign UI", () => {
  it("renders partner-safe validity, availability and CTA", () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText("Специальное предложение")).toBeInTheDocument();
    expect(screen.getByText(/Доступно до/)).toBeInTheDocument();
    expect(screen.getByText("В наличии: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть предложение" })).toHaveAttribute("href", "/cabinet/offers/campaign-1");
  });

  it("uses accessible 44px quantity and cart controls", () => {
    render(<CampaignCartControl itemId="item-1" maximum={10} minimum={2} />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveValue(2);
    expect(screen.getByRole("button", { name: /Добавить в корзину/ })).toHaveClass("min-h-11");
  });
});
