import Decimal from "decimal.js";
import { convertUsdToWholeMdl, createCommercialOpportunity, type ProductCommercialViewDto } from "../../pricing-inventory/services/pricing-inventory.service";
import type { CampaignCommercialSummary, CampaignProduct, PartnerCampaign } from "../types";

export type CampaignPreviewContext = { partnerRate: number | null; retailRate: number | null; products: Array<{ productId: string; partnerPrice: import("../types").CampaignMoney | null; retailPrice: import("../types").CampaignMoney | null }> };

export function previewCommercialViews(context: CampaignPreviewContext): ProductCommercialViewDto[] {
  return context.products.map(p => {
    const price = p.partnerPrice;
    const mdl = (rate: number | null) => {
      const amount = price?.currency === "MDL" ? price.amount : price?.currency === "USD" ? convertUsdToWholeMdl(price.amount, rate) : null;
      return amount === null ? null : { amount, currencyCode: "MDL", formattedAmount: null, conversionEvidence: { sourceAmount: price!.amount, sourceCurrencyCode: price!.currency as "USD" | "MDL", appliedRate: rate, rateId: null, ratePurpose: null, rateSourceType: null, rateEffectiveAt: null, ratePublishedAt: null, resultingAmount: amount, resultingCurrencyCode: "MDL" as const } };
    };
    return { productId: p.productId, partnerPrice: price ? { amount: price.amount, currencyCode: price.currency, formattedAmount: null } : null,
      partnerPriceMdl: mdl(context.partnerRate), partnerCheckoutPriceMdl: mdl(context.retailRate), retailPrice: p.retailPrice ? { amount: p.retailPrice.amount, currencyCode: p.retailPrice.currency, formattedAmount: null } : null, stock: null, isDemoData: false };
  });
}

export function validSpecialPrice(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(value) && new Decimal(value).gt(0);
}

/** Monetary authority remains in services; never accepts client totals, savings or markup. */
export function campaignCommercialSummary(lines: CampaignProduct[], views: ProductCommercialViewDto[], bundle: boolean): CampaignCommercialSummary | null {
  if (!lines.length || lines.some(p => !p.specialPrice || !Number.isFinite(p.specialPrice.amount) || p.specialPrice.amount <= 0)) return null;
  const currency = lines[0].specialPrice!.currency;
  if (currency !== "USD" && currency !== "MDL" || lines.some(p => p.specialPrice!.currency !== currency)) return null;
  const byId = new Map(views.map(v => [v.productId, v]));
  let special = new Decimal(0), normal = new Decimal(0), retail = new Decimal(0), specialMdl = new Decimal(0), units = 0;
  let normalReady = true, retailReady = true, markupReady = true;
  let partnerRate: number | null = null, retailRate: number | null = null;
  for (const line of lines) {
    const quantity = bundle ? line.requiredBundleQuantity ?? 0 : 1;
    if (!Number.isInteger(quantity) || quantity <= 0) return null;
    units += quantity;
    const view = byId.get(line.productId);
    const partner: import("../../pricing-inventory/services/pricing-inventory.service").ProductPriceViewDto | null | undefined = currency === "USD" ? view?.partnerPrice : view?.partnerPriceMdl;
    if (partner?.currencyCode === currency && Number.isFinite(partner.amount) && partner.amount > 0) normal = normal.plus(new Decimal(partner.amount).times(quantity)); else normalReady = false;
    if (view?.retailPrice?.currencyCode === "MDL" && Number.isFinite(view.retailPrice.amount) && view.retailPrice.amount > 0) retail = retail.plus(new Decimal(view.retailPrice.amount).times(quantity)); else retailReady = false;
    special = special.plus(new Decimal(line.specialPrice!.amount).times(quantity));
    const pr = view?.partnerPriceMdl?.conversionEvidence?.appliedRate ?? null;
    const rr = view?.partnerCheckoutPriceMdl?.conversionEvidence?.appliedRate ?? null;
    if (partnerRate !== null && partnerRate !== pr || retailRate !== null && retailRate !== rr) markupReady = false;
    partnerRate = pr; retailRate = rr;
    const mdl = currency === "MDL" ? line.specialPrice!.amount : convertUsdToWholeMdl(line.specialPrice!.amount, pr);
    if (mdl === null) markupReady = false; else specialMdl = specialMdl.plus(new Decimal(mdl).times(quantity));
  }
  const opportunity = markupReady && retailReady ? createCommercialOpportunity(
    { amount: specialMdl.toNumber(), currencyCode: "MDL", formattedAmount: null },
    { amount: retail.toNumber(), currencyCode: "MDL", formattedAmount: null },
    partnerRate === null ? null : { rate: partnerRate }, retailRate === null ? null : { rate: retailRate },
  ) : null;
  const saving = normalReady && normal.gt(0) && normal.gt(special) ? normal.minus(special) : null;
  return { normalPartnerTotal: normalReady ? normal.toFixed(2) : null, specialBundleTotal: special.toFixed(2), saving: saving?.toFixed(2) ?? null,
    savingPercent: saving ? saving.div(normal).times(100).toNumber() : null, markupPercent: opportunity?.markupPercent ?? null,
    currency, retailTotal: retailReady ? retail.toFixed(2) : null, markupFromRetail: opportunity?.formattedMarkup ?? null, skuCount: lines.length, totalUnits: units };
}

export function projectCampaignCommercial(campaign: PartnerCampaign, views: ProductCommercialViewDto[]): PartnerCampaign {
  return { ...campaign, commercialSummary: ["bundle_special_price", "fixed_bundle_promo"].includes(campaign.mechanicType) ? campaignCommercialSummary(campaign.products, views, true) : null,
    products: campaign.products.map(product => ({ ...product, commercialSummary: campaignCommercialSummary([product], views, false) })) };
}
