import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartnerOfferFeedItem } from "../../offer-feed";
import { PartnerOfferFeedCard } from "../PartnerOfferFeedCard";

const mocks = vi.hoisted(() => ({
  cart: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
  bundle: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
}));
vi.mock("../CampaignCartControl", () => ({ CampaignCartControl: mocks.cart }));
vi.mock("../CampaignBundleProgress", () => ({
  CampaignBundleProgress: mocks.bundle,
}));
vi.mock("../CampaignCountdown", () => ({ CampaignCountdown: () => null }));
vi.mock("@/src/modules/catalog/components/ProductThumbnail", () => ({
  ProductThumbnail: () => null,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const product = {
  itemId: "item",
  productId: "product",
  name: "Датчик / Sensor",
  sku: "SKU-1",
  slug: "sensor",
  imageUrl: null,
  availableQuantity: 8,
  minimumQuantity: 1,
  maximumQuantityPerCompany: 10,
  partnerPrice: { amount: 92, currency: "USD" },
  specialPrice: { amount: 84, currency: "USD" },
  msrpPrice: { amount: 120, currency: "USD" },
  requiredBundleQuantity: 2,
};
const base = {
  offerId: "campaign:1:item",
  campaignId: "campaign",
  publicationVersion: 1,
  campaignTitle: "Published offer",
  mechanicType: "legacy_promo",
  remainingSeconds: 3600,
  campaign: { title: "Published offer", products: [product] },
};

describe("mixed offer presentation", () => {
  it("shows conditional trigger quantities and the governed reward without mechanic codes", () => {
    const offer = { ...base, kind: "CONDITIONAL", mechanicType: "conditional_attach_promo",
      campaign: { ...base.campaign, products: [{ ...product, attachRole: "REWARD" }] },
      progress: { triggers: [{ campaignItemId: "trigger", name: "Trigger sensor", requiredTriggerQuantity: 2, currentQuantity: 1 }], triggerStockReady: true, rewardStockReady: true }
    } as Extract<PartnerOfferFeedItem, { kind: "CONDITIONAL" }>;
    const { container } = render(<PartnerOfferFeedCard locale="ru" offer={offer} />);
    expect(screen.getByText("Купите:")).toBeTruthy();
    expect(screen.getByText("Получите:")).toBeTruthy();
    expect(screen.getByText("2 шт.")).toBeTruthy();
    expect(screen.getByText("В корзине: 1 / 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Посмотреть условия" }).getAttribute("href")).toBe("/cabinet/offers/campaign");
    expect(container.textContent).not.toContain("conditional_attach_promo");
    expect(mocks.cart).not.toHaveBeenCalled();
  });
  it("keeps spend threshold and canonical progress in USD without invented conversion", () => {
    const offer = { ...base, kind: "SPEND_THRESHOLD", mechanicType: "spend_threshold_promo",
      campaign: { ...base.campaign, products: [{ ...product, spendRole: "REWARD" }] },
      progress: { thresholdAmountUsd: "1500.00", qualifyingSpendUsd: "200.00", remainingSpendUsd: "1300.00" }
    } as Extract<PartnerOfferFeedItem, { kind: "SPEND_THRESHOLD" }>;
    render(<PartnerOfferFeedCard locale="ru" offer={offer} />);
    expect(screen.getByText("1500.00 USD")).toBeTruthy();
    expect(screen.getByText("В корзине: 200.00 / 1500.00 USD")).toBeTruthy();
    expect(screen.getByText("Осталось: 1300.00 USD")).toBeTruthy();
    expect(mocks.cart).not.toHaveBeenCalled();
  });
  it("renders one independent product with governed price emphasis and the existing cart identity", () => {
    const { container } = render(
      <PartnerOfferFeedCard
        locale="ru"
        offer={
          {
            ...base,
            kind: "PRODUCT",
            product,
            directCart: true,
          } as PartnerOfferFeedItem
        }
      />,
    );
    expect(screen.getByText("SKU SKU-1")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: product.name }).getAttribute("href"),
    ).toBe("/cabinet/catalog/sensor");
    expect(container.querySelector(".line-through")?.textContent).toContain(
      "92",
    );
    expect(mocks.cart.mock.calls[0]?.[0]).toMatchObject({
      itemId: "item",
      publicationVersion: 1,
      minimum: 1,
      maximum: 10,
    });
    expect(
      screen
        .getByRole("link", { name: "Открыть предложение" })
        .getAttribute("href"),
    ).toBe("/cabinet/offers/campaign");
  });
  it("keeps a bundle whole and reuses compact canonical bundle controls", () => {
    const offer = {
      ...base,
      kind: "BUNDLE",
      mechanicType: "fixed_bundle_promo",
      progress: { campaignId: "campaign" },
      summary: {
        skuCount: 1,
        totalUnits: 2,
        normalPartnerTotal: "184",
        specialBundleTotal: "168",
        saving: "16",
        retailTotal: null,
        markupFromRetail: null,
        currency: "USD",
      },
    } as Extract<PartnerOfferFeedItem, { kind: "BUNDLE" }>;
    render(<PartnerOfferFeedCard locale="ru" offer={offer} />);
    expect(screen.getByText("1 SKU · 2 шт.")).toBeTruthy();
    expect(screen.queryByText("SKU SKU-1 · 2 шт.")).toBeNull();
    expect(screen.getByText("Набор")).toBeTruthy();
    expect(screen.getByText("Спеццена набора")).toBeTruthy();
    expect(mocks.bundle.mock.calls[0]?.[0]).toMatchObject({
      compact: true,
      progress: offer.progress,
      mechanicType: "fixed_bundle_promo",
    });
    expect(mocks.cart).not.toHaveBeenCalled();
  });
});
