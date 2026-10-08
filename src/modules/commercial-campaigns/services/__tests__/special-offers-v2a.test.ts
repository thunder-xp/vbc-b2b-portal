import { describe, expect, it, vi } from "vitest";
import { campaignTimeState, campaignRemainingSeconds } from "../campaign-lifecycle";
import { campaignCommercialSummary, previewCommercialViews } from "../campaign-commercial-projection";
import * as canonical from "../../../pricing-inventory/services/pricing-inventory.service";
import { CommercialCampaignService } from "../commercial-campaign.service";
import type { CampaignDraftInput, CampaignProduct, PartnerCampaign } from "../../types";
import type { CommercialCampaignRepository } from "../../repositories";

const view = previewCommercialViews({ partnerRate: 18.6, retailRate: 18.01, products: [
  { productId: "a", partnerPrice: { amount: 92, currency: "USD" }, retailPrice: { amount: 2600, currency: "MDL" } },
  { productId: "b", partnerPrice: { amount: 150, currency: "USD" }, retailPrice: { amount: 4200, currency: "MDL" } },
] });
const lines = [{ productId: "a", requiredBundleQuantity: 4, specialPrice: { amount: 84.15, currency: "USD" } },
  { productId: "b", requiredBundleQuantity: 1, specialPrice: { amount: 120.1, currency: "USD" } }] as CampaignProduct[];
function draft(): CampaignDraftInput { return { contractVersion: "3", requestId: "request", code: "BUNDLE_SPECIAL", name: "Test bundle", partnerTitle: "Test bundle",
  partnerDescription: "Test-only governed bundle", termsSummary: "Test terms", campaignType: "product_offer", startsAt: "2026-10-08T10:00:00Z", endsAt: "2026-10-09T10:00:00Z",
  priority: 1, mechanicType: "bundle_special_price", audienceMode: "explicit_company", companyIds: ["company"], items: lines.map((l, sortOrder) => ({ productId: l.productId,
    sortOrder, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null,
    promoThresholdQuantity: null, requiredBundleQuantity: l.requiredBundleQuantity, bundleSpecialUnitPrice: String(l.specialPrice!.amount), bundleSpecialCurrency: "USD" })) }; }

describe("Special Offers V2A authoritative projection", () => {
  it.each([["2026-10-08T09:59:59Z", "UPCOMING"], ["2026-10-08T10:00:00Z", "ACTIVE"], ["2026-10-09T10:00:00Z", "EXPIRED"]])("derives state at %s", (time, state) => {
    expect(campaignTimeState(draft().startsAt, draft().endsAt, new Date(time))).toBe(state);
  });
  it("fails closed for invalid or inverted dates and clamps expired time", () => {
    expect(campaignTimeState("bad", "bad", new Date())).toBe("EXPIRED");
    expect(campaignTimeState(draft().endsAt, draft().startsAt, new Date())).toBe("EXPIRED");
    expect(campaignRemainingSeconds(draft().endsAt, new Date("2026-10-09T10:00:01Z"))).toBe(0);
  });
  it("uses exact Decimal totals, quantities, actual RTL999 and the canonical cross-rate markup helper", () => {
    const spy = vi.spyOn(canonical, "createCommercialOpportunity");
    const expected = canonical.createCommercialOpportunity({ amount: 1565 * 4 + 2234, currencyCode: "MDL", formattedAmount: null },
      { amount: 14600, currencyCode: "MDL", formattedAmount: null }, { rate: 18.6 }, { rate: 18.01 });
    spy.mockClear();
    expect(campaignCommercialSummary(lines, view, true)).toEqual({ normalPartnerTotal: "518.00", specialBundleTotal: "456.70", saving: "61.30", currency: "USD",
      retailTotal: "14600.00", markupFromRetail: expected!.formattedMarkup, skuCount: 2, totalUnits: 5 });
    expect(spy).toHaveBeenCalledOnce(); spy.mockRestore();
  });
  it("supports single product advantage and MDL campaign prices without synthetic retail prices", () => {
    expect(campaignCommercialSummary([lines[0]], view, false)).toMatchObject({ normalPartnerTotal: "92.00", specialBundleTotal: "84.15", saving: "7.85", totalUnits: 1 });
    const mdl = { ...lines[0], specialPrice: { amount: 1500, currency: "MDL" } };
    expect(campaignCommercialSummary([mdl], view, false)).toMatchObject({ normalPartnerTotal: "1711.00", specialBundleTotal: "1500.00", saving: "211.00" });
    expect(campaignCommercialSummary(lines, [], true)).toMatchObject({ normalPartnerTotal: null, retailTotal: null, markupFromRetail: null });
  });
  it("rejects mixed currency and missing authoritative special prices", () => {
    expect(campaignCommercialSummary([lines[0], { ...lines[1], specialPrice: { amount: 120, currency: "MDL" } }], view, true)).toBeNull();
    expect(campaignCommercialSummary([{ ...lines[0], specialPrice: null }], view, true)).toBeNull();
  });
  it.each(["dates", "zero-lines", "zero-qty", "fractional-qty", "zero-price", "bad-currency", "mixed-currency", "duplicate", "missing-price"])("rejects invalid Admin input: %s", issue => {
    const repo = { createDraft: vi.fn() }; const service = new CommercialCampaignService(repo as unknown as CommercialCampaignRepository, {} as never); const input = draft();
    if (issue === "dates") input.endsAt = input.startsAt;
    if (issue === "zero-lines") input.items = [];
    if (issue === "zero-qty") input.items[0].requiredBundleQuantity = 0;
    if (issue === "fractional-qty") input.items[0].requiredBundleQuantity = 1.5;
    if (issue === "zero-price") input.items[0].bundleSpecialUnitPrice = "0";
    if (issue === "missing-price") input.items[0].bundleSpecialUnitPrice = null;
    if (issue === "bad-currency") input.items[0].bundleSpecialCurrency = "EUR" as "USD";
    if (issue === "mixed-currency") input.items[0].bundleSpecialCurrency = "MDL";
    if (issue === "duplicate") input.items[1].productId = input.items[0].productId;
    expect(() => service.createDraft(input)).toThrow(); expect(repo.createDraft).not.toHaveBeenCalled();
  });
  it("Admin preview rejects unresolved identity and calls one bounded server price context", async () => {
    const repo = { previewContext: vi.fn().mockResolvedValue({ products: [], partnerRate: 18.6, retailRate: 18.01 }) };
    const service = new CommercialCampaignService(repo as unknown as CommercialCampaignRepository, {} as never);
    await expect(service.previewBundle(draft(), "company")).rejects.toThrow("unresolved");
    expect(repo.previewContext).toHaveBeenCalledExactlyOnceWith("company", ["a", "b"]);
    repo.previewContext.mockResolvedValue({ products: [{ productId: "a", partnerPrice: { amount: 92, currency: "USD" }, retailPrice: { amount: 2600, currency: "MDL" } },
      { productId: "b", partnerPrice: { amount: 150, currency: "USD" }, retailPrice: { amount: 4200, currency: "MDL" } }], partnerRate: 18.6, retailRate: 18.01 });
    expect(await service.previewBundle(draft(), "company")).toMatchObject({ specialBundleTotal: "456.70", saving: "61.30" });
  });
  it("projects all offers using one deduplicated commercial batch and reuses the existing showcase discovery", async () => {
    const campaign = { id: "campaign", startsAt: draft().startsAt, endsAt: draft().endsAt, mechanicType: "bundle_special_price", products: lines } as PartnerCampaign;
    const repo = { listPartner: vi.fn().mockResolvedValue({ items: [campaign, campaign], totalCount: 2 }) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue(view) };
    const service = new CommercialCampaignService(repo as unknown as CommercialCampaignRepository, { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "company" }) } as never, pricing as never);
    await service.listPartner("user"); expect(pricing.getProductCommercialViews).toHaveBeenCalledExactlyOnceWith("user", ["a", "b"]);
    repo.listPartner.mockClear(); pricing.getProductCommercialViews.mockClear();
    const preview = await service.getActiveProductPreview("user", true);
    expect(preview.productIds).toEqual(["a", "b"]); expect(preview.timeRemaining).toHaveProperty("a");
    expect(repo.listPartner).toHaveBeenCalledOnce(); expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
  });
});
