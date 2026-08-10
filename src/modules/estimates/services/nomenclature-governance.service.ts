import type { ExternalNomenclatureItemType } from "../repositories";
import type { NomenclatureCurationStatus, NomenclatureGovernanceRepository } from "../repositories/nomenclature-governance.repository";

export class NomenclatureGovernanceService {
  constructor(private readonly repository: NomenclatureGovernanceRepository) {}
  async list(filters: { search?: string; itemType?: ExternalNomenclatureItemType; status?: NomenclatureCurationStatus; category?: string; manufacturer?: string; page?: number }) {
    const page = Math.max(1, Math.floor(filters.page ?? 1)); const limit = 25;
    const result = await this.repository.list({ ...filters, search: filters.search?.trim().slice(0, 160), category: filters.category?.trim().slice(0,160), manufacturer: filters.manufacturer?.trim().slice(0,120), limit, offset: (page - 1) * limit });
    return { ...result, page, totalPages: Math.max(1, Math.ceil(result.totalCount / limit)) };
  }
  getDetail(itemId: string) { return this.repository.getDetail(uuid(itemId)); }
  update(input: Parameters<NomenclatureGovernanceRepository["update"]>[0]) {
    if (input.reason.trim().length < 10 || !input.name.trim()) throw new Error("INVALID_NOMENCLATURE_CURATION");
    return this.repository.update({ ...input, itemId: uuid(input.itemId), manufacturer: input.manufacturer?.trim() || null, model: input.model?.trim() || null, name: input.name.trim(), category: input.category?.trim() || null, specification: input.specification?.trim() || null, reason: input.reason.trim() });
  }
  markDuplicate(sourceItemId: string, canonicalItemId: string, reason: string) {
    if (reason.trim().length < 10) throw new Error("INVALID_NOMENCLATURE_CURATION");
    return this.repository.markDuplicate(uuid(sourceItemId), uuid(canonicalItemId), reason.trim());
  }
}
function uuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("INVALID_NOMENCLATURE_ID"); return value; }
