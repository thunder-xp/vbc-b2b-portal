import type { AdminCampaignDetail, AdminCampaignFilter, AdminCampaignPage, CampaignBuilderOptions, CampaignCompanySearch, CampaignDraftInput, CampaignDraftUpdateInput, CampaignFilter, CampaignProductSearch, PartnerCampaign, PartnerCampaignPage } from "../types";

export interface CommercialCampaignRepository {
  listPartner(input: { companyId: string; filter: CampaignFilter; limit: number; offset: number }): Promise<PartnerCampaignPage>;
  getPartner(companyId: string, campaignId: string): Promise<PartnerCampaign | null>;
  addToCart(input: { companyId: string; campaignItemId: string; quantity: number; requestId: string }): Promise<{ cartItemId: string; quantity: number }>;
  recordEngagement(input: { companyId: string; campaignId: string; campaignItemId?: string; eventType: "impression" | "detail_opened" | "product_opened"; quantity?: number; requestId: string }): Promise<void>;
  listAdmin(input: Required<Pick<AdminCampaignFilter, "pageSize">> & Omit<AdminCampaignFilter, "page" | "pageSize"> & { offset: number }): Promise<AdminCampaignPage>;
  getAdmin(campaignId: string): Promise<AdminCampaignDetail | null>;
  getBuilderOptions(search?: string): Promise<CampaignBuilderOptions>;
  searchProducts(input: { search: string; categoryId?: string; brandId?: string; inStockOnly: boolean; limit: number; offset: number }): Promise<CampaignProductSearch>;
  searchCompanies(input: { search: string; limit: number; offset: number }): Promise<CampaignCompanySearch>;
  createDraft(input: CampaignDraftInput): Promise<string>;
  updateDraft(input: CampaignDraftUpdateInput): Promise<{ revision: number }>;
  duplicate(campaignId: string, requestId: string): Promise<string>;
  archive(campaignId: string, reason: string): Promise<void>;
  resume(campaignId: string, reason: string): Promise<void>;
  reopenForEdit(campaignId: string, reason: string): Promise<{ revision: number }>;
  deleteArchived(campaignId: string, reason: string): Promise<void>;
  publish(campaignId: string, requestId: string): Promise<{ status: string; version: number; audienceCount: number }>;
  pause(campaignId: string, reason: string): Promise<void>;
}

export class CommercialCampaignRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Commercial campaigns are unavailable.");
    this.name = "CommercialCampaignRepositoryError";
  }
}
