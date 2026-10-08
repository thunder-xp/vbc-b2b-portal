import { describe, expect, it } from "vitest";
import {
  campaignCommercialSummary,
  previewCommercialViews,
  projectCampaignCommercial,
} from "../campaign-commercial-projection";
import {
  createCommercialOpportunity,
  convertUsdToWholeMdl,
} from "../../../pricing-inventory/services/pricing-inventory.service";
import type { CampaignProduct, PartnerCampaign } from "../../types";

const product = {
  productId: "p",
  requiredBundleQuantity: 2,
  specialPrice: { amount: 84, currency: "USD" },
} as CampaignProduct;
const views = previewCommercialViews({
  partnerRate: 18.6,
  retailRate: 18.01,
  products: [
    {
      productId: "p",
      partnerPrice: { amount: 92, currency: "USD" },
      retailPrice: { amount: 2280, currency: "MDL" },
    },
  ],
});
describe("shared V3B commercial truth", () => {
  it("uses SPECIAL, not normal price, in the canonical cross-rate markup", () => {
    const expected = createCommercialOpportunity(
      {
        amount: convertUsdToWholeMdl(84, 18.6)!,
        currencyCode: "MDL",
        formattedAmount: null,
      },
      views[0].retailPrice!,
      { rate: 18.6 },
      { rate: 18.01 },
    );
    const summary = campaignCommercialSummary([product], views, false);
    expect(summary?.markupPercent).toBe(expected?.markupPercent);
    expect(summary?.saving).toBe("8.00");
    expect(summary?.savingPercent).toBeCloseTo(8.69565217);
  });
  it("keeps missing normal/retail/FX explicitly unresolved", () => {
    expect(campaignCommercialSummary([product], [], false)).toMatchObject({
      normalPartnerTotal: null,
      saving: null,
      savingPercent: null,
      retailTotal: null,
      markupPercent: null,
    });
    expect(
      campaignCommercialSummary(
        [product],
        [{ ...views[0], partnerPriceMdl: null }],
        false,
      )?.markupPercent,
    ).toBeNull();
  });
  it("does not advertise savings on a special price at or above normal", () => {
    for (const amount of [92, 100])
      expect(
        campaignCommercialSummary(
          [{ ...product, specialPrice: { amount, currency: "USD" } }],
          views,
          false,
        ),
      ).toMatchObject({ saving: null, savingPercent: null });
  });
  it.each(["fixed_bundle_promo", "bundle_special_price"] as const)(
    "reuses identical feed/detail bundle projection for %s",
    (mechanicType) => {
      const campaign = { mechanicType, products: [product] } as PartnerCampaign;
      expect(
        projectCampaignCommercial(campaign, views).commercialSummary,
      ).toEqual(campaignCommercialSummary([product], views, true));
    },
  );
});
