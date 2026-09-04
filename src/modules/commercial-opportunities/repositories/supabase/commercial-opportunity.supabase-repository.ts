import { createClient } from "@/src/lib/supabase/server";

import type { CommercialOpportunity, CommercialOpportunityPage, OpportunityMoney, OpportunityProduct } from "../../types";
import { CommercialOpportunityRepositoryError, type CommercialOpportunityRepository } from "../commercial-opportunity.repository";

type Row = Record<string, unknown>;

export class SupabaseCommercialOpportunityRepository implements CommercialOpportunityRepository {
  async list(input: Parameters<CommercialOpportunityRepository["list"]>[0]): Promise<CommercialOpportunityPage> {
    const { data, error } = await (await createClient()).rpc("list_partner_commercial_opportunities", {
      target_company_id: input.companyId,
      target_filter: input.filter,
      target_limit: input.limit,
      target_offset: input.offset,
    });
    if (error || !isRecord(data)) throw new CommercialOpportunityRepositoryError(error?.code ?? null);
    return {
      items: Array.isArray(data.items) ? data.items.flatMap(mapOpportunity) : [],
      totalCount: number(data.totalCount),
    };
  }

  async dismiss(opportunityId: string): Promise<void> {
    const { error } = await (await createClient()).rpc("dismiss_partner_commercial_opportunity", {
      target_opportunity_id: opportunityId,
    });
    if (error) throw new CommercialOpportunityRepositoryError(error.code);
  }
}

function mapOpportunity(value: unknown): CommercialOpportunity[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") return [];
  return [{
    id: value.id,
    type: value.type as CommercialOpportunity["type"],
    priority: number(value.priority),
    reasonCode: text(value.reasonCode),
    reasonMetadata: isRecord(value.reasonMetadata) ? value.reasonMetadata : {},
    secondaryReasons: strings(value.secondaryReasons),
    fingerprint: text(value.fingerprint),
    firstDetectedAt: text(value.firstDetectedAt),
    lastConfirmedAt: text(value.lastConfirmedAt),
    sourceType: text(value.sourceType),
    sourceId: text(value.sourceId),
    product: mapProduct(value.product),
    template: isRecord(value.template) && typeof value.template.id === "string"
      ? { id: value.template.id, name: text(value.template.name) }
      : null,
  }];
}

function mapProduct(value: unknown): OpportunityProduct | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    sku: text(value.sku),
    name: text(value.name),
    slug: text(value.slug),
    imageUrl: nullableText(value.imageUrl),
    categoryName: nullableText(value.categoryName),
    partnerPrice: money(value.partnerPrice),
    retailPrice: money(value.retailPrice),
    availableQuantity: nullableNumber(value.availableQuantity),
    expectedArrivalDate: nullableText(value.expectedArrivalDate),
    expectedArrivalQuantity: nullableNumber(value.expectedArrivalQuantity),
    alreadyInCart: value.alreadyInCart === true,
  };
}

function money(value: unknown): OpportunityMoney | null {
  return isRecord(value) && Number.isFinite(Number(value.amount)) && typeof value.currency === "string"
    ? { amount: Number(value.amount), currency: value.currency }
    : null;
}
function isRecord(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
