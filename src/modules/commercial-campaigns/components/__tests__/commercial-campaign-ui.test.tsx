import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OfferDetailPage from "@/app/(partner)/cabinet/offers/[campaignId]/page";
import { CampaignCard, CampaignCartControl, CampaignPriceStack } from "..";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { getCampaign } = vi.hoisted(() => ({ getCampaign: vi.fn() }));
vi.mock("../../actions", () => ({ addCampaignItemToCartAction: vi.fn(), getPartnerCampaignAction: getCampaign }));
vi.mock("@/src/modules/partner-locale/server", () => ({ getPartnerLocale: vi.fn().mockResolvedValue("ru") }));
vi.mock("../CampaignViewEvidence", () => ({ CampaignViewEvidence: () => null }));

const product = { itemId: "item-1", productId: "product-1", sku: "400123", name: "Camera", slug: "camera", imageUrl: "/camera.webp", minimumQuantity: 2, maximumQuantityPerCompany: 10, partnerMessage: null, mechanicType: "legacy_promo" as const, promoThresholdQuantity: null, msrpPrice: { amount: 120, currency: "USD" }, partnerPrice: { amount: 100, currency: "USD" }, specialPrice: { amount: 90, currency: "USD" }, price: { amount: 100, currency: "USD" }, availableQuantity: 5, expectedArrivalDate: null };
const campaign = { publicationVersion: 1, id: "campaign-1", code: "TEST", title: "Предложение для вашей компании", description: "Актуальное предложение Novotech", type: "product_offer" as const, startsAt: "2026-07-31T00:00:00Z", endsAt: "2026-08-10T00:00:00Z", priority: 1, imageAssetPath: "/offer.webp", termsSummary: "Текущая цена", mechanicType: "legacy_promo" as const, products: [product] };

describe("commercial campaign UI", () => {
  it("renders partner-safe validity, availability and CTA", () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText("Специальное предложение")).toBeInTheDocument();
    expect(screen.getByText(/Доступно до/)).toBeInTheDocument();
    expect(screen.getByText("В наличии: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть предложение" })).toHaveAttribute("href", "/cabinet/offers/campaign-1");
  });

  it("shows evidence-backed V2 pricing for a named legacy PROMO SKU without treating it as a bundle", () => {
    const commercialSummary = { normalPartnerTotal: "100.00", specialBundleTotal: "90.00", saving: "10.00", retailTotal: null, markupFromRetail: null, currency: "USD" as const, skuCount: 1, totalUnits: 1 };
    render(<CampaignCard campaign={{ ...campaign, timeState: "ACTIVE", remainingSeconds: 86400, products: [{ ...product, commercialSummary }, { ...product, itemId: "item-2", productId: "product-2", name: "Other camera" }] }} />);
    expect(screen.getByTestId("campaign-featured-product")).toHaveTextContent("Camera");
    expect(screen.getByText("SKU 400123")).toBeInTheDocument();
    expect(screen.getByText("Ваша цена").nextElementSibling).toHaveClass("line-through");
    expect(screen.getByText("Спеццена")).toBeInTheDocument();
    expect(screen.getByText("Экономия")).toBeInTheDocument();
    expect(screen.getByText("До конца: 1 дн. 0 ч.")).toBeInTheDocument();
    expect(screen.queryByText("Набор по спеццене")).toBeNull();
    expect(screen.queryByText("Розничная цена")).toBeNull();
    expect(screen.queryByText("Наценка от розницы")).toBeNull();
  });

  it("omits legacy commercial advantage without governed special-price evidence", () => {
    render(<CampaignCard campaign={{ ...campaign, products: [{ ...product, specialPrice: null }, { ...product, itemId: "item-2", productId: "product-2", specialPrice: null }] }} />);
    expect(screen.queryByTestId("campaign-featured-product")).toBeNull();
    expect(screen.queryByText("Спеццена")).toBeNull();
  });

  it("renders the existing legacy detail hero without compact-page CSS hiding its title or description", async () => {
    getCampaign.mockResolvedValue({ success: true, data: { ...campaign, timeState: "ACTIVE", remainingSeconds: 86400 } });
    render(await OfferDetailPage({ params: Promise.resolve({ campaignId: campaign.id }) }));
    const hero = screen.getByTestId("campaign-hero");
    expect(hero).not.toHaveAttribute("data-partner-page-header");
    expect(hero).toHaveTextContent(campaign.title);
    expect(hero).toHaveTextContent(campaign.description);
    expect(screen.getByText("секунд")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeInTheDocument();
    expect(screen.queryByText("Выгодный комплект для партнёров")).toBeNull();
    expect(screen.queryByRole("button", { name: "Добавить набор в корзину" })).toBeNull();
  });

  it("uses accessible 44px quantity and cart controls", () => {
    render(<CampaignCartControl publicationVersion={1} itemId="item-1" maximum={10} mechanicType="legacy_promo" minimum={2} promoPrice={product.specialPrice} promoThresholdQuantity={null} />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveValue(2);
    expect(screen.getByRole("button", { name: "В корзину" })).toHaveClass("min-h-11");
  });

  it("explains progress to the governed per-product PROMO threshold", () => {
    render(<CampaignCartControl publicationVersion={1} itemId="item-1" maximum={10} mechanicType="quantity_threshold_promo" minimum={1} promoPrice={product.specialPrice} promoThresholdQuantity={5} />);
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
