import { createClient } from "@/src/lib/supabase/server";

import type { PurchasingList, PurchasingListItem } from "../../types";
import { PurchasingListRepositoryError, type PurchasingListIndexRecord, type PurchasingListItemInput, type PurchasingListRecord, type PurchasingListRepository } from "../purchasing-list.repository";

const LIST_COLUMNS = "id, company_id, name, description, visibility, created_by, updated_by, revision, created_at, updated_at, archived_at";
const ITEM_COLUMNS = "id, list_id, product_id, quantity, position, note, source_type, source_reference_id, source_unit_price, source_currency_code, created_at, updated_at";
type Row = Record<string, unknown>;

export class SupabasePurchasingListRepository implements PurchasingListRepository {
  async list(input: Parameters<PurchasingListRepository["list"]>[0]) {
    const { data, error } = await (await createClient()).rpc("list_purchasing_lists_page", {
      target_company_id: input.companyId, target_search: input.search ? escapeSearch(input.search) : null,
      target_visibility: input.visibility, target_mine: input.mine, target_archived: input.archived,
      target_limit: input.limit, target_offset: input.offset,
    });
    if (error) throw new PurchasingListRepositoryError(error.code);
    const rows = (data ?? []) as Row[];
    return { records: rows.map(mapIndexRecord), totalCount: Number(rows[0]?.total_count ?? 0) };
  }

  async findById(listId: string) {
    const { data, error } = await (await createClient()).from("purchasing_lists")
      .select(`${LIST_COLUMNS}, creator:user_profiles!purchasing_lists_created_by_fkey(full_name), purchasing_list_items(${ITEM_COLUMNS})`)
      .eq("id", listId).order("position", { referencedTable: "purchasing_list_items", ascending: true }).maybeSingle();
    if (error) throw new PurchasingListRepositoryError(error.code);
    return data ? mapRecord(data as Row) : null;
  }

  create(input: Parameters<PurchasingListRepository["create"]>[0]) { return this.rpcList("create_purchasing_list", { target_company_id: input.companyId, target_name: input.name, target_description: input.description, target_visibility: input.visibility, target_source_type: input.sourceType, target_source_reference_id: input.sourceReferenceId, target_items: mapItems(input.items) }); }
  updateMetadata(input: Parameters<PurchasingListRepository["updateMetadata"]>[0]) { return this.rpcList("update_purchasing_list_metadata", { target_list_id: input.listId, expected_revision: input.expectedRevision, target_name: input.name, target_description: input.description, target_visibility: input.visibility }); }
  mergeItems(input: Parameters<PurchasingListRepository["mergeItems"]>[0]) { return this.rpcList("merge_purchasing_list_items", { target_list_id: input.listId, expected_revision: input.expectedRevision, target_merge_mode: input.mergeMode, target_source_type: input.sourceType, target_source_reference_id: input.sourceReferenceId, target_items: mapItems(input.items) }); }
  updateItems(input: Parameters<PurchasingListRepository["updateItems"]>[0]) { return this.rpcList("update_purchasing_list_items", { target_list_id: input.listId, expected_revision: input.expectedRevision, target_items: input.items.map((item) => ({ item_id: item.itemId, quantity: item.quantity, position: item.position, note: item.note })) }); }
  removeItems(input: Parameters<PurchasingListRepository["removeItems"]>[0]) { return this.rpcList("remove_purchasing_list_items", { target_list_id: input.listId, expected_revision: input.expectedRevision, target_item_ids: input.itemIds }); }
  setArchived(input: Parameters<PurchasingListRepository["setArchived"]>[0]) { return this.rpcList("set_purchasing_list_archived", { target_list_id: input.listId, expected_revision: input.expectedRevision, target_archived: input.archived }); }
  duplicate(input: Parameters<PurchasingListRepository["duplicate"]>[0]) { return this.rpcList("duplicate_purchasing_list", { target_list_id: input.listId, target_name: input.name }); }

  async mergeIntoCart(input: Parameters<PurchasingListRepository["mergeIntoCart"]>[0]) {
    const { data, error } = await (await createClient()).rpc("merge_purchasing_list_into_cart", { target_list_id: input.listId, target_request_key: input.requestKey, target_request_fingerprint: input.requestFingerprint, target_items: input.items.map((item) => ({ item_id: item.itemId, product_id: item.productId, quantity: item.quantity })), target_summary: input.summary });
    if (error || !isRecord(data)) throw new PurchasingListRepositoryError(error?.code ?? null);
    return { cartId: text(data.cart_id), repeated: data.repeated === true };
  }

  private async rpcList(name: string, args: Record<string, unknown>): Promise<PurchasingList> {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error || !data) throw new PurchasingListRepositoryError(error?.code ?? null);
    return mapList(data as Row);
  }
}

function mapItems(items: PurchasingListItemInput[]) { return items.map((item) => ({ product_id: item.productId, quantity: item.quantity, note: item.note ?? null, source_reference_id: item.sourceReferenceId ?? null, source_unit_price: item.sourceUnitPrice ?? null, source_currency_code: item.sourceCurrencyCode ?? null })); }
function mapIndexRecord(row: Row): PurchasingListIndexRecord { return { ...mapList(row), ownerName: text(row.owner_name) || "Пользователь компании", itemCount: Number(row.item_count), totalQuantity: Number(row.total_quantity), productIds: Array.isArray(row.product_ids) ? row.product_ids.filter((value): value is string => typeof value === "string") : [] }; }
function mapRecord(row: Row): PurchasingListRecord { const creator = isRecord(row.creator) ? row.creator : {}; return { ...mapList(row), ownerName: text(creator.full_name) || "Пользователь компании", items: Array.isArray(row.purchasing_list_items) ? (row.purchasing_list_items as Row[]).map(mapItem).sort((a, b) => a.position - b.position) : [] }; }
function mapList(row: Row): PurchasingList { return { id: text(row.id), companyId: text(row.company_id), name: text(row.name), description: nullableText(row.description), visibility: row.visibility as PurchasingList["visibility"], createdBy: text(row.created_by), updatedBy: text(row.updated_by), revision: Number(row.revision), createdAt: text(row.created_at), updatedAt: text(row.updated_at), archivedAt: nullableText(row.archived_at) }; }
function mapItem(row: Row): PurchasingListItem { return { id: text(row.id), listId: text(row.list_id), productId: text(row.product_id), quantity: Number(row.quantity), position: Number(row.position), note: nullableText(row.note), sourceType: row.source_type as PurchasingListItem["sourceType"], sourceReferenceId: nullableText(row.source_reference_id), sourceUnitPrice: nullableNumber(row.source_unit_price), sourceCurrencyCode: nullableText(row.source_currency_code), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }
function escapeSearch(value: string) { return value.replace(/[%_]/g, " "); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { return typeof value === "string" ? value : null; }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
