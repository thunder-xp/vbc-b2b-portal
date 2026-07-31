import { createClient } from "@/src/lib/supabase/server";

import type { PurchaseTemplate, PurchaseTemplateItem } from "../../types";
import { PurchaseTemplateRepositoryError, type PurchaseTemplateIndexRecord, type PurchaseTemplateItemInput, type PurchaseTemplateRecord, type PurchaseTemplateRepository } from "../purchase-template.repository";

const TEMPLATE_COLUMNS = "id, company_id, owner_user_id, name, description, visibility, status, source_type, source_id, usage_count, last_used_at, revision, created_at, updated_at, archived_at";
const ITEM_COLUMNS = "id, template_id, product_id, preferred_quantity, line_note, sort_order, created_at, updated_at";
type Row = Record<string, unknown>;

export class SupabasePurchaseTemplateRepository implements PurchaseTemplateRepository {
  async list(input: Parameters<PurchaseTemplateRepository["list"]>[0]) {
    const { data, error } = await (await createClient()).rpc("list_purchase_templates_page", {
      target_company_id: input.companyId,
      target_search: input.search,
      target_filter: input.filter,
      target_limit: input.limit,
      target_offset: input.offset,
    });
    if (error) throw new PurchaseTemplateRepositoryError(error.code);
    const rows = (data ?? []) as Row[];
    return { records: rows.map(mapIndexRecord), totalCount: Number(rows[0]?.total_count ?? 0) };
  }

  async findById(templateId: string) {
    const { data, error } = await (await createClient()).from("purchase_templates")
      .select(`${TEMPLATE_COLUMNS}, owner:user_profiles!purchase_templates_owner_user_id_fkey(full_name), purchase_template_items(${ITEM_COLUMNS})`)
      .eq("id", templateId)
      .order("sort_order", { referencedTable: "purchase_template_items", ascending: true })
      .maybeSingle();
    if (error) throw new PurchaseTemplateRepositoryError(error.code);
    return data ? mapRecord(data as Row) : null;
  }

  create(input: Parameters<PurchaseTemplateRepository["create"]>[0]) {
    return this.rpcTemplate("create_purchase_template", {
      target_company_id: input.companyId,
      target_name: input.name,
      target_description: input.description,
      target_visibility: input.visibility,
      target_source_type: input.sourceType,
      target_source_id: input.sourceId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      target_items: mapItems(input.items),
    });
  }

  update(input: Parameters<PurchaseTemplateRepository["update"]>[0]) {
    return this.rpcTemplate("update_purchase_template", {
      target_template_id: input.templateId,
      expected_revision: input.expectedRevision,
      target_name: input.name,
      target_description: input.description,
      target_visibility: input.visibility,
      target_items: mapItems(input.items),
    });
  }

  archive(templateId: string, expectedRevision: number) {
    return this.rpcTemplate("archive_purchase_template", { target_template_id: templateId, expected_revision: expectedRevision });
  }

  copy(input: Parameters<PurchaseTemplateRepository["copy"]>[0]) {
    return this.rpcTemplate("copy_purchase_template", {
      target_template_id: input.templateId,
      target_name: input.name,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
    });
  }

  async mergeIntoCart(input: Parameters<PurchaseTemplateRepository["mergeIntoCart"]>[0]) {
    const { data, error } = await (await createClient()).rpc("merge_purchase_template_into_cart", {
      target_template_id: input.templateId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      target_items: input.items.map((item) => ({ item_id: item.itemId, product_id: item.productId, quantity: item.quantity })),
      target_summary: input.summary,
    });
    if (error || !isRecord(data)) throw new PurchaseTemplateRepositoryError(error?.code ?? null);
    return { cartId: text(data.cart_id), repeated: data.repeated === true };
  }

  private async rpcTemplate(name: string, args: Record<string, unknown>): Promise<PurchaseTemplate> {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error || !data) throw new PurchaseTemplateRepositoryError(error?.code ?? null);
    return mapTemplate(data as Row);
  }
}

function mapItems(items: PurchaseTemplateItemInput[]) {
  return items.map((item) => ({ product_id: item.productId, preferred_quantity: item.preferredQuantity, line_note: item.lineNote, sort_order: item.sortOrder }));
}
function mapIndexRecord(row: Row): PurchaseTemplateIndexRecord {
  return { ...mapTemplate(row), ownerName: text(row.owner_name) || "Пользователь компании", itemCount: Number(row.item_count), totalQuantity: Number(row.total_quantity), productIds: stringArray(row.product_ids), itemIntents: itemIntents(row.item_intents) };
}
function mapRecord(row: Row): PurchaseTemplateRecord {
  const owner = isRecord(row.owner) ? row.owner : {};
  return { ...mapTemplate(row), ownerName: text(owner.full_name) || "Пользователь компании", items: Array.isArray(row.purchase_template_items) ? (row.purchase_template_items as Row[]).map(mapItem).sort((a, b) => a.sortOrder - b.sortOrder) : [] };
}
function mapTemplate(row: Row): PurchaseTemplate {
  return { id: text(row.id), companyId: text(row.company_id), ownerUserId: text(row.owner_user_id), name: text(row.name), description: nullableText(row.description), visibility: row.visibility as PurchaseTemplate["visibility"], status: row.status as PurchaseTemplate["status"], sourceType: row.source_type as PurchaseTemplate["sourceType"], sourceId: nullableText(row.source_id), usageCount: Number(row.usage_count), lastUsedAt: nullableText(row.last_used_at), revision: Number(row.revision), createdAt: text(row.created_at), updatedAt: text(row.updated_at), archivedAt: nullableText(row.archived_at) };
}
function mapItem(row: Row): PurchaseTemplateItem {
  return { id: text(row.id), templateId: text(row.template_id), productId: text(row.product_id), preferredQuantity: Number(row.preferred_quantity), lineNote: nullableText(row.line_note), sortOrder: Number(row.sort_order), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { return typeof value === "string" ? value : null; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function itemIntents(value: unknown) { return Array.isArray(value) ? value.flatMap((item) => isRecord(item) && typeof item.productId === "string" && Number.isFinite(Number(item.quantity)) ? [{ productId: item.productId, quantity: Number(item.quantity) }] : []) : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
