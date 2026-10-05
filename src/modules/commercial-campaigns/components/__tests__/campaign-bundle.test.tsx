import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignBundleProgress } from "../CampaignBundleProgress";
import { CampaignBuilder } from "../CampaignBuilder";
import type { CampaignBundleState, CampaignDraftSeed } from "../../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";

const { complete, refresh } = vi.hoisted(() => ({ complete: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({
  completeCampaignBundleAction: complete, createCampaignDraftAction: vi.fn(), updateCampaignDraftAction: vi.fn(),
  searchCampaignProductsAction: vi.fn().mockResolvedValue({ success: true, data: { items: [], totalCount: 0, totalPages: 1 } }),
  searchCampaignCompaniesAction: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
}));
const progress: CampaignBundleState = { campaignId: "bundle-1", publicationVersion: 1, eligible: false,
  conditionsReady: true, stockReady: true, reason: "incomplete_bundle", components: [
    { campaignItemId: "item-a", productId: "a", sku: "A", name: "Camera", requiredBundleQuantity: 4, currentQuantity: 3, missingQuantity: 1, availableQuantity: 10 },
    { campaignItemId: "item-b", productId: "b", sku: "B", name: "Recorder", requiredBundleQuantity: 1, currentQuantity: 0, missingQuantity: 1, availableQuantity: 10 },
  ] };

describe("fixed bundle presentation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders server basket progress without calculating commercial eligibility in React", () => {
    render(<CampaignBundleProgress locale="ru" progress={progress} />);
    expect(screen.getAllByText("До PROMO не хватает: 1")).toHaveLength(2);
    expect(screen.getByText("В корзине: 3 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить комплект" })).toBeEnabled();
  });
  it("uses only campaign/request identity and refreshes the shared cart after atomic completion", async () => {
    complete.mockResolvedValue({ success: true, data: { ...progress, eligible: true }, message: "Комплект добавлен в корзину." });
    render(<CampaignBundleProgress locale="ru" progress={progress} />);
    fireEvent.click(screen.getByRole("button", { name: "Добавить комплект" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(complete).toHaveBeenCalledWith({ campaignId: "bundle-1", requestId: expect.any(String), publicationVersion: 1 });
    expect(Object.keys(complete.mock.calls[0][0]).sort()).toEqual(["campaignId", "publicationVersion", "requestId"]);
  });
  it("keeps one retry identity after transport failure", async () => {
    complete.mockResolvedValue({ success: false, message: "Unavailable" });
    render(<CampaignBundleProgress locale="ru" progress={progress} />);
    const button = screen.getByRole("button", { name: "Добавить комплект" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]);
  });
  it("does not imply a complete known-insufficient kit is purchasable", () => {
    render(<CampaignBundleProgress locale="ru" progress={{ ...progress, stockReady: false }} />);
    expect(screen.getByText("Недостаточно наличия для полного комплекта.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить комплект" })).toBeDisabled();
  });
  it("renders the authoritative completed state even if the displayed quantities differ", () => {
    render(<CampaignBundleProgress locale="ru" progress={{ ...progress, eligible: true }} />);
    expect(screen.getByText("Комплект собран / PROMO активна")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить комплект" })).toBeDisabled();
  });
  it("offers required per-component quantities with the existing admin editor", () => {
    const product = { id: "a", sku: "A", model: "Camera", name: "Camera", imageUrl: null, categoryId: null, categoryName: null,
      brandId: null, brandName: null, availableQuantity: 10, currentPrice: { amount: 92, currency: "USD" }, promoPrice: { amount: 84, currency: "USD" } };
    const initial: CampaignDraftSeed = { campaignId: "bundle-1", revision: 0, values: { code: "BUNDLE", name: "Bundle", title: "Bundle",
      description: "A fixed bundle", terms: "Terms", internalNote: "", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-05T10:00",
      priority: 1, image: "", mechanicType: "fixed_bundle_promo" }, audienceMode: "explicit_company", companyIds: ["company"],
      items: [{ productId: "a", sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null,
        benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef,
        partnerMessage: null, promoThresholdQuantity: null, requiredBundleQuantity: 4, product }] };
    render(<CampaignBuilder initial={initial} options={{ products: [product], productTotalCount: 1, companies: [], priceProfiles: [], categories: [], brands: [], assets: [] }} />);
    expect(screen.getByRole("option", { name: "Комплект → PROMO" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2. Товары" }));
    expect(screen.getByRole("spinbutton", { name: "Количество в комплекте A" })).toHaveValue(4);
    const nextButtons = screen.getAllByRole("button", { name: "Далее" });
    fireEvent.click(nextButtons[nextButtons.length - 1]);
    expect(screen.getByText("В комплекте должно быть не менее двух разных товаров.")).toBeInTheDocument();
  });
});
