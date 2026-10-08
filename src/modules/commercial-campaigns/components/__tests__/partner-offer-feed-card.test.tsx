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
        .getByRole("link", { name: "Условия кампании" })
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
    expect(screen.getByText("SKU SKU-1 · 2 шт.")).toBeTruthy();
    expect(mocks.bundle.mock.calls[0]?.[0]).toMatchObject({
      compact: true,
      progress: offer.progress,
      mechanicType: "fixed_bundle_promo",
    });
    expect(mocks.cart).not.toHaveBeenCalled();
  });
});
