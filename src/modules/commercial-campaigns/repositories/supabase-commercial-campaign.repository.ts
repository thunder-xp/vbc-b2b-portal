import { createClient } from "@/src/lib/supabase/server";
import type { AdminCampaignDetail, AdminCampaignPage, CampaignBuilderOptions, PartnerCampaign, PartnerCampaignPage } from "../types";
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
  async listAdmin(limit: number, offset: number): Promise<AdminCampaignPage> {
    const { data, error } = await (await createClient()).rpc("list_admin_commercial_campaigns", { p_limit: limit, p_offset: offset });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return { items: Array.isArray(data.items) ? data.items.flatMap(mapAdminSummary) : [], totalCount: number(data.totalCount) };
  }
  async getAdmin(campaignId: string): Promise<AdminCampaignDetail | null> {
    const { data, error } = await (await createClient()).rpc("get_admin_commercial_campaign", { p_campaign_id: campaignId });
    if (error) throw new CommercialCampaignRepositoryError(error.code);
    if (!record(data) || !record(data.campaign)) return null;
    const analytics = record(data.analytics) ? data.analytics : {};
    return { campaign: data.campaign, items: records(data.items), rules: records(data.rules), audience: records(data.audience), analytics: { impressions: number(analytics.impressions), opens: number(analytics.opens), carts: number(analytics.carts), orders: number(analytics.orders), attributedQuantity: number(analytics.attributedQuantity) } };
  }
  async getBuilderOptions(search = ""): Promise<CampaignBuilderOptions> {
    const { data, error } = await (await createClient()).rpc("get_commercial_campaign_builder_options", { p_search: search });
    if (error || !record(data)) throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return {
      products: records(data.products).map((item) => ({ id: text(item.id), sku: text(item.sku), name: text(item.name), imageUrl: nullableText(item.imageUrl) })),
      companies: records(data.companies).map((item) => ({ id: text(item.id), name: text(item.name), status: text(item.status) })),
    };
  }
  async createDraft(input: Parameters<CommercialCampaignRepository["createDraft"]>[0]): Promise<string> {
    const { data, error } = await (await createClient()).rpc("create_commercial_campaign_draft", { p_input: input });
    if (error || typeof data !== "string") throw new CommercialCampaignRepositoryError(error?.code ?? null);
    return data;
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
  return [{ id: value.id, code: text(value.code), name: text(value.name), partnerTitle: text(value.partner_title), status: text(value.status) as "draft", startsAt: text(value.starts_at), endsAt: text(value.ends_at), priority: number(value.priority), itemCount: number(value.item_count), audienceCount: number(value.audience_count), createdAt: text(value.created_at) }];
}
function record(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function records(value: unknown): Row[] { return Array.isArray(value) ? value.filter(record) : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
