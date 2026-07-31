import type { AdminCampaignDetail, AdminCampaignPage, CampaignBuilderOptions, CampaignDraftInput, CampaignFilter, PartnerCampaign, PartnerCampaignPage } from "../types";

export interface CommercialCampaignRepository {
  listPartner(input: { companyId: string; filter: CampaignFilter; limit: number; offset: number }): Promise<PartnerCampaignPage>;
  getPartner(companyId: string, campaignId: string): Promise<PartnerCampaign | null>;
  addToCart(input: { companyId: string; campaignItemId: string; quantity: number; requestId: string }): Promise<{ cartItemId: string; quantity: number }>;
  recordEngagement(input: { companyId: string; campaignId: string; campaignItemId?: string; eventType: "impression" | "detail_opened" | "product_opened"; quantity?: number; requestId: string }): Promise<void>;
  listAdmin(limit: number, offset: number): Promise<AdminCampaignPage>;
  getAdmin(campaignId: string): Promise<AdminCampaignDetail | null>;
  getBuilderOptions(search?: string): Promise<CampaignBuilderOptions>;
  createDraft(input: CampaignDraftInput): Promise<string>;
  publish(campaignId: string, requestId: string): Promise<{ status: string; version: number; audienceCount: number }>;
  pause(campaignId: string, reason: string): Promise<void>;
}

export class CommercialCampaignRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Commercial campaigns are unavailable.");
    this.name = "CommercialCampaignRepositoryError";
  }
}
