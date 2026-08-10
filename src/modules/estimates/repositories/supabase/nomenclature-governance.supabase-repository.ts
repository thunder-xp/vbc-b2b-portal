import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import { EstimateRepositoryError } from "../estimate.repository";
import type { AdminNomenclatureDetail, AdminNomenclatureRecord, NomenclatureGovernanceRepository } from "../nomenclature-governance.repository";

export class SupabaseNomenclatureGovernanceRepository implements NomenclatureGovernanceRepository {
  async list(input: Parameters<NomenclatureGovernanceRepository["list"]>[0]) {
    const { data, error } = await (await createClient()).rpc("list_admin_external_nomenclature", {
      search_query: input.search ?? null, item_type_filter: input.itemType ?? null, status_filter: input.status ?? null,
      category_filter: input.category ?? null, manufacturer_filter: input.manufacturer ?? null,
      result_limit: input.limit, result_offset: input.offset,
    });
    if (error || !data) throw mapError(error?.code);
    const payload = data as { items?: Record<string, unknown>[]; total?: number };
    return { records: (payload.items ?? []).map(mapRecord), totalCount: Number(payload.total ?? 0) };
  }
  async getDetail(itemId: string) {
    const { data, error } = await (await createClient()).rpc("get_admin_external_nomenclature_detail", { target_external_nomenclature_id: itemId });
    if (error) throw mapError(error.code); if (!data) return null;
    const row = data as Record<string, unknown>;
    return { ...mapRecord(row), canonicalItemId: typeof row.canonical_item_id === "string" ? row.canonical_item_id : null,
      events: (Array.isArray(row.events) ? row.events : []).map((event) => { const value = event as Record<string, unknown>; return { id: String(value.id), eventType: String(value.event_type), reason: typeof value.reason === "string" ? value.reason : null, createdAt: String(value.created_at) }; }) } satisfies AdminNomenclatureDetail;
  }
  async update(input: Parameters<NomenclatureGovernanceRepository["update"]>[0]) {
    const { data, error } = await (await createClient()).rpc("update_admin_external_nomenclature", {
      target_external_nomenclature_id: input.itemId, expected_version: input.expectedVersion, target_item_type: input.itemType,
      target_manufacturer: input.manufacturer ?? "", target_model: input.model ?? "", target_name: input.name,
      target_category: input.category ?? "", target_unit: input.unit, target_specification: input.specification ?? "",
      target_status: input.status, change_reason: input.reason,
    });
    if (error || data === null) throw mapError(error?.code); return Number(data);
  }
  async markDuplicate(sourceItemId: string, canonicalItemId: string, reason: string) {
    const { data, error } = await (await createClient()).rpc("curate_external_nomenclature_duplicate", { source_item_id: sourceItemId, target_canonical_item_id: canonicalItemId, curation_reason: reason });
    if (error || !data) throw mapError(error?.code); return String(data);
  }
}

function mapRecord(row: Record<string, unknown>): AdminNomenclatureRecord {
  return { id: String(row.id), itemType: row.item_type as AdminNomenclatureRecord["itemType"], manufacturer: text(row.manufacturer), model: text(row.model), name: String(row.name),
    category: text(row.category), unit: String(row.unit), specification: text(row.specification), curationStatus: row.curation_status as AdminNomenclatureRecord["curationStatus"],
    hasCover: typeof row.has_cover === "boolean" ? row.has_cover : typeof row.canonical_cover_storage_key === "string", version: Number(row.version),
    companyCount: Number(row.company_count ?? 0), estimateCount: Number(row.estimate_count ?? 0), requestCount: Number(row.request_count ?? 0),
    firstObserved: String(row.first_observed ?? row.created_at), lastObserved: String(row.last_observed ?? row.updated_at) };
}
function text(value: unknown) { return typeof value === "string" ? value : null; }
function mapError(code?: string) { return new EstimateRepositoryError(code === "40001" ? "conflict" : code === "P0002" ? "not_found" : code === "22023" ? "invalid" : "persistence", code ?? null); }
