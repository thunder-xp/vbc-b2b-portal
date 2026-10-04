import { createClient } from "@/src/lib/supabase/server";
import type { AdminCampaignDetail, AdminCampaignPage, CampaignBuilderOptions, CampaignCompanySearch, CampaignProductOption, CampaignProductSearch, PartnerCampaign, PartnerCampaignPage } from "../types";
import { CommercialCampaignRepositoryError, type CommercialCampaignRepository } from "./commercial-campaign.repository";

type Row = Record<string, unknown>;

export class SupabaseCommercialCampaignRepository implements CommercialCampaignRepository {
  async listPartner(input: Parameters<CommercialCampaignRepository["listPartner"]>[0]): Promise<PartnerCampaignPage> {
    const { data, error } = await (await createClient()).rpc("list_partner_commercial_campaigns", { p_company_id: input.companyId, p_filter: input.filter, p_limit: input.limit, p_offset: input.offset });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { items: Array.isArray(data.items) ? data.items.flatMap(mapCampaign) : [], totalCount: number(data.totalCount) };
  }
  async getPartner(companyId: string, campaignId: string): Promise<PartnerCampaign | null> {
    const { data, error } = await (await createClient()).rpc("get_partner_commercial_campaign", { p_company_id: companyId, p_campaign_id: campaignId });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
    return mapCampaign(data)[0] ?? null;
  }
  async addToCart(input: Parameters<CommercialCampaignRepository["addToCart"]>[0]) {
    const { data, error } = await (await createClient()).rpc("add_commercial_campaign_item_to_cart", { p_company_id: input.companyId, p_campaign_item_id: input.campaignItemId, p_quantity: input.quantity, p_request_id: input.requestId });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { cartItemId: text(data.cartItemId), quantity: number(data.quantity) };
  }
  async recordEngagement(input: Parameters<CommercialCampaignRepository["recordEngagement"]>[0]): Promise<void> {
    const { error } = await (await createClient()).rpc("record_commercial_campaign_engagement", { p_company_id: input.companyId, p_campaign_id: input.campaignId, p_campaign_item_id: input.campaignItemId ?? null, p_event_type: input.eventType, p_quantity: input.quantity ?? null, p_request_id: input.requestId });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
  }
  async listAdmin(input: Parameters<CommercialCampaignRepository["listAdmin"]>[0]): Promise<AdminCampaignPage> {
    const { data, error } = await (await createClient()).rpc("list_admin_commercial_campaigns_v2", {
      p_status: !input.status || input.status === "all" ? null : input.status,
      p_search: input.search ?? "",
      p_campaign_type: !input.campaignType || input.campaignType === "all" ? null : input.campaignType,
      p_date_from: input.dateFrom || null,
      p_date_to: input.dateTo || null,
      p_limit: input.pageSize,
      p_offset: input.offset,
    });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { items: Array.isArray(data.items) ? data.items.flatMap(mapAdminSummary) : [], totalCount: number(data.totalCount) };
  }
  async getAdmin(campaignId: string): Promise<AdminCampaignDetail | null> {
    const { data, error } = await (await createClient()).rpc("get_admin_commercial_campaign_v2", { p_campaign_id: campaignId });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
    if (!record(data) || !record(data.campaign)) return null;
    const analytics = record(data.analytics) ? data.analytics : {};
    return { campaign: data.campaign, items: records(data.items), rules: records(data.rules), audience: records(data.audience), analytics: { impressions: number(analytics.impressions), opens: number(analytics.opens), carts: number(analytics.carts), orders: number(analytics.orders), attributedQuantity: number(analytics.attributedQuantity) } };
  }
  async getBuilderOptions(search = ""): Promise<CampaignBuilderOptions> {
    const { data, error } = await (await createClient()).rpc("get_commercial_campaign_builder_options_v2", { p_search: search });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return {
      products: records(data.products).map(mapProduct),
      productTotalCount: number(data.productTotalCount),
      categories: records(data.categories).map((item) => ({ id: text(item.id), parentId: nullableText(item.parentId), name: text(item.name) })),
      brands: records(data.brands).map((item) => ({ id: text(item.id), name: text(item.name) })),
      companies: records(data.companies).map((item) => ({ id: text(item.id), name: text(item.name), status: text(item.status) })),
      priceProfiles: records(data.priceProfiles).map((item) => ({ reference: text(item.reference), code: nullableText(item.code), name: text(item.name), currency: nullableText(item.currency) })),
      assets: records(data.assets).map((item) => ({ path: text(item.path), label: text(item.label) })),
    };
  }
  async searchProducts(input: Parameters<CommercialCampaignRepository["searchProducts"]>[0]): Promise<CampaignProductSearch> {
    const { data, error } = await (await createClient()).rpc("search_commercial_campaign_products_v2", {
      p_search: input.search,
      p_category_id: input.categoryId ?? null,
      p_brand_id: input.brandId ?? null,
      p_in_stock_only: input.inStockOnly,
      p_limit: input.limit,
      p_offset: input.offset,
    });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { items: records(data.items).map(mapProduct), totalCount: number(data.totalCount), page: Math.floor(input.offset / input.limit) + 1, totalPages: Math.max(1, Math.ceil(number(data.totalCount) / input.limit)) };
  }
  async searchCompanies(input: Parameters<CommercialCampaignRepository["searchCompanies"]>[0]): Promise<CampaignCompanySearch> {
    const { data, error } = await (await createClient()).rpc("search_commercial_campaign_companies_v1", { p_search: input.search, p_limit: input.limit, p_offset: input.offset });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { items: records(data.items).map((item) => ({ id: text(item.id), name: text(item.name), status: text(item.status) })), totalCount: number(data.totalCount) };
  }
  async createDraft(input: Parameters<CommercialCampaignRepository["createDraft"]>[0]): Promise<string> {
    const { data, error } = await (await createClient()).rpc("create_commercial_campaign_draft_v2", { p_input: input });
    if (error || typeof data !== "string") throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return data;
  }
  async updateDraft(input: Parameters<CommercialCampaignRepository["updateDraft"]>[0]): Promise<{ revision: number }> {
    const { data, error } = await (await createClient()).rpc("update_commercial_campaign_draft_v2", { p_campaign_id: input.campaignId, p_expected_revision: input.expectedRevision, p_request_id: input.requestId, p_input: input });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.message ?? error?.code ?? null);
    return { revision: number(data.revision) };
  }
  async duplicate(campaignId: string, requestId: string): Promise<string> {
    const { data, error } = await (await createClient()).rpc("duplicate_commercial_campaign_v1", { p_campaign_id: campaignId, p_request_id: requestId });
    if (error || typeof data !== "string") throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return data;
  }
  async archive(campaignId: string, reason: string): Promise<void> {
    const { error } = await (await createClient()).rpc("archive_commercial_campaign_v1", { p_campaign_id: campaignId, p_reason: reason });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
  }
  async resume(campaignId: string, reason: string): Promise<void> {
    const { error } = await (await createClient()).rpc("resume_commercial_campaign_v1", { p_campaign_id: campaignId, p_reason: reason });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
  }
  async publish(campaignId: string, requestId: string) {
    const { data, error } = await (await createClient()).rpc("publish_commercial_campaign", { p_campaign_id: campaignId, p_request_id: requestId });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { status: text(data.status), version: number(data.version), audienceCount: number(data.audienceCount) };
  }
  async pause(campaignId: string, reason: string): Promise<void> {
    const { error } = await (await createClient()).rpc("pause_commercial_campaign", { p_campaign_id: campaignId, p_reason: reason });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
  }
}

function mapCampaign(value: unknown): PartnerCampaign[] {
  if (!record(value) || typeof value.id !== "string") return [];
  return [{ id: value.id, code: text(value.code), title: text(value.title), description: text(value.description), type: text(value.type) as PartnerCampaign["type"], startsAt: text(value.startsAt), endsAt: text(value.endsAt), priority: number(value.priority), imageAssetPath: nullableText(value.imageAssetPath), termsSummary: text(value.termsSummary), products: records(value.products).map((item) => ({ itemId: text(item.itemId), productId: text(item.productId), sku: text(item.sku), name: text(item.name), slug: text(item.slug), imageUrl: nullableText(item.imageUrl), minimumQuantity: number(item.minimumQuantity), maximumQuantityPerCompany: nullableNumber(item.maximumQuantityPerCompany), partnerMessage: nullableText(item.partnerMessage), price: record(item.price) ? { amount: number(item.price.amount), currency: text(item.price.currency) } : null, availableQuantity: nullableNumber(item.availableQuantity), expectedArrivalDate: nullableText(item.expectedArrivalDate) })) }];
}
function mapAdminSummary(value: unknown) {
  if (!record(value) || typeof value.id !== "string") return [];
  return [{ id: value.id, code: text(value.code), name: text(value.name), partnerTitle: text(value.partner_title), status: text(value.status) as "draft", startsAt: text(value.starts_at), endsAt: text(value.ends_at), priority: number(value.priority), itemCount: number(value.item_count), audienceCount: number(value.audience_count), createdAt: text(value.created_at), updatedAt: text(value.updated_at) }];
}
function mapProduct(item: Row): CampaignProductOption {
  return { id: text(item.id), sku: text(item.sku), model: nullableText(item.model), name: text(item.name), imageUrl: nullableText(item.imageUrl), categoryId: nullableText(item.categoryId), categoryName: nullableText(item.categoryName), brandId: nullableText(item.brandId), brandName: nullableText(item.brandName), availableQuantity: nullableNumber(item.availableQuantity), currentPrice: record(item.currentPrice) ? { amount: number(item.currentPrice.amount), currency: text(item.currentPrice.currency) } : null };
}
function record(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function records(value: unknown): Row[] { return Array.isArray(value) ? value.filter(record) : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
