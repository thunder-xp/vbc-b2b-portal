import { InvalidStateError } from "../../access-control/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { CommercialCampaignRepository } from "../repositories";
import type { AdminCampaignFilter, CampaignDraftInput, CampaignDraftUpdateInput, CampaignFilter } from "../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../promo-profile";
import { isCampaignRequiredQuantityValid } from "../campaign-draft-mechanics";
import { isSpendConfigValid } from "../spend-config";

export class CommercialCampaignService {
  constructor(private readonly repository: CommercialCampaignRepository, private readonly workspaceContext: PartnerWorkspaceContextService) {}

  async listPartner(userId: string, input: { filter?: CampaignFilter; page?: number; pageSize?: number } = {}) {
    const companyId = await this.companyId(userId);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const result = await this.repository.listPartner({ companyId, filter: input.filter ?? "active", limit: pageSize, offset: (page - 1) * pageSize });
    return { ...result, page, totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)) };
  }
  async getPartner(userId: string, campaignId: string) { return this.repository.getPartner(await this.companyId(userId), campaignId); }
  async addToCart(userId: string, campaignItemId: string, quantity: number, requestId: string) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new InvalidStateError("Campaign quantity is invalid.");
    return this.repository.addToCart({ companyId: await this.companyId(userId), campaignItemId, quantity, requestId });
  }
  async completeBundle(userId: string, campaignId: string, requestId: string) {
    return this.repository.completeBundle({ companyId: await this.companyId(userId), campaignId, requestId });
  }
  async recordEngagement(userId: string, input: Omit<Parameters<CommercialCampaignRepository["recordEngagement"]>[0], "companyId">) {
    try { await this.repository.recordEngagement({ ...input, companyId: await this.companyId(userId) }); } catch { /* Analytics must not block buying. */ }
  }
  listAdmin(input: AdminCampaignFilter = {}) {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    return this.repository.listAdmin({ status: input.status, search: input.search?.trim().slice(0, 100), campaignType: input.campaignType, dateFrom: input.dateFrom, dateTo: input.dateTo, pageSize, offset: (page - 1) * pageSize });
  }
  getAdmin(campaignId: string) { return this.repository.getAdmin(campaignId); }
  getBuilderOptions(search?: string) { return this.repository.getBuilderOptions(search?.trim().slice(0, 100)); }
  searchProducts(input: { search?: string; categoryId?: string; brandId?: string; inStockOnly?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const limit = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 25)));
    return this.repository.searchProducts({ search: input.search?.trim().slice(0, 100) ?? "", categoryId: input.categoryId || undefined, brandId: input.brandId || undefined, inStockOnly: input.inStockOnly === true, limit, offset: (page - 1) * limit });
  }
  searchCompanies(search = "", offset = 0) { return this.repository.searchCompanies({ search: search.trim().slice(0, 100), limit: 25, offset: Math.max(0, Math.trunc(offset)) }); }
  createDraft(input: CampaignDraftInput) { validateDraft(input); return this.repository.createDraft(input); }
  updateDraft(input: CampaignDraftUpdateInput) { validateDraft(input); if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new InvalidStateError("Campaign revision is invalid."); return this.repository.updateDraft(input); }
  duplicate(campaignId: string, requestId: string) { return this.repository.duplicate(campaignId, requestId); }
  archive(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign archive reason is required."); return this.repository.archive(campaignId, reason.trim()); }
  resume(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign resume reason is required."); return this.repository.resume(campaignId, reason.trim()); }
  reopenForEdit(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign reopen reason is required."); return this.repository.reopenForEdit(campaignId, reason.trim()); }
  deleteArchived(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign deletion reason is required."); return this.repository.deleteArchived(campaignId, reason.trim()); }
  publish(campaignId: string, requestId: string) { return this.repository.publish(campaignId, requestId); }
  pause(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign pause reason is required."); return this.repository.pause(campaignId, reason.trim()); }

  private async companyId(userId: string): Promise<string> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) throw new InvalidStateError("Partner workspace access is not active.");
    return context.companyId;
  }
}

function validateDraft(input: CampaignDraftInput): void {
  const starts = Date.parse(input.startsAt); const ends = Date.parse(input.endsAt);
  if (input.contractVersion !== "3" || !/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(input.code) || input.name.trim().length < 3 || input.partnerTitle.trim().length < 3 || input.partnerDescription.trim().length < 10 || input.termsSummary.trim().length < 3 || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || !input.items.length || input.items.length > 50 || (input.audienceMode === "explicit_company" && !input.companyIds.length)) throw new InvalidStateError("Campaign input is invalid.");
  if (input.items.some((item) => item.minimumQuantity < 1 || item.maximumQuantityPerCompany !== null && item.maximumQuantityPerCompany < item.minimumQuantity)) throw new InvalidStateError("Campaign quantity limits are invalid.");
  if (input.items.some((item) => item.benefitType === "existing_price_profile" ? item.governedBenefitReference !== SPECIAL_OFFERS_PROMO_PROFILE.externalRef : item.governedBenefitReference !== null)) throw new InvalidStateError("Campaign price profile must be PROMO.");
  if (input.mechanicType !== "fixed_bundle_promo" && input.items.some((item) => item.requiredBundleQuantity != null)) throw new InvalidStateError("Bundle quantities require the fixed bundle mechanic.");
  if (input.mechanicType !== "conditional_attach_promo" && input.items.some((item) => item.attachRole != null || item.requiredTriggerQuantity != null)) throw new InvalidStateError("Attach roles require the conditional attach mechanic.");
  if (input.mechanicType !== "spend_threshold_promo" && input.spendConfig != null) throw new InvalidStateError("Spend config requires the spend mechanic.");
  if (input.mechanicType === "spend_threshold_promo") {
    if (!isSpendConfigValid(input.spendConfig, input.items)) throw new InvalidStateError("Укажите положительный USD-порог, товары закупки и один отдельный товар с PROMO.");
  } else if (input.mechanicType === "conditional_attach_promo") {
    if (input.items.filter((item) => item.attachRole === "TRIGGER").length < 1
      || input.items.filter((item) => item.attachRole === "REWARD").length !== 1
      || new Set(input.items.map((item) => item.productId)).size !== input.items.length
      || input.items.some((item) => item.promoThresholdQuantity !== null || item.requiredBundleQuantity != null
        || (item.attachRole === "TRIGGER" ? item.benefitType !== "informational_only" || item.governedBenefitReference !== null
          || !isCampaignRequiredQuantityValid(item.requiredTriggerQuantity, item.minimumQuantity, item.maximumQuantityPerCompany)
          : item.attachRole !== "REWARD" || item.requiredTriggerQuantity != null || item.benefitType !== "existing_price_profile"))) {
      throw new InvalidStateError("Укажите хотя бы один товар-условие с целым количеством и ровно один отдельный товар с PROMO.");
    }
  } else if (input.mechanicType === "fixed_bundle_promo") {
    if (input.items.length < 2 || new Set(input.items.map((item) => item.productId)).size !== input.items.length
      || input.items.some((item) => item.benefitType !== "existing_price_profile" || item.governedBenefitReference !== SPECIAL_OFFERS_PROMO_PROFILE.externalRef
        || !isCampaignRequiredQuantityValid(item.requiredBundleQuantity, item.minimumQuantity, item.maximumQuantityPerCompany)
        || item.promoThresholdQuantity !== null)) {
      throw new InvalidStateError("Bundle → PROMO requires at least two distinct products with positive required quantities and governed PROMO.");
    }
  } else if (input.mechanicType === "quantity_threshold_promo") {
    if (input.items.some((item) => item.benefitType !== "existing_price_profile" || item.governedBenefitReference !== SPECIAL_OFFERS_PROMO_PROFILE.externalRef
      || !isCampaignRequiredQuantityValid(item.promoThresholdQuantity, 1, item.maximumQuantityPerCompany))) throw new InvalidStateError("Quantity → PROMO requires a valid per-product threshold and governed PROMO price.");
  } else if (input.mechanicType !== "legacy_promo" || input.items.some((item) => item.promoThresholdQuantity !== null)) {
    throw new InvalidStateError("Campaign mechanic configuration is invalid.");
  }
}
