import type { ExternalNomenclatureItemType } from "./estimate.repository";

export type NomenclatureCurationStatus = "active" | "review_required" | "duplicate" | "archived";
export type AdminNomenclatureRecord = {
  id: string; itemType: ExternalNomenclatureItemType; manufacturer: string | null; model: string | null; name: string;
  category: string | null; unit: string; specification: string | null; curationStatus: NomenclatureCurationStatus;
  hasCover: boolean; version: number; companyCount: number; estimateCount: number; requestCount: number;
  firstObserved: string; lastObserved: string;
};
export type AdminNomenclatureDetail = AdminNomenclatureRecord & { canonicalItemId: string | null; events: Array<{ id: string; eventType: string; reason: string | null; createdAt: string }> };

export interface NomenclatureGovernanceRepository {
  list(input: { search?: string; itemType?: ExternalNomenclatureItemType; status?: NomenclatureCurationStatus; category?: string; manufacturer?: string; limit: number; offset: number }): Promise<{ records: AdminNomenclatureRecord[]; totalCount: number }>;
  getDetail(itemId: string): Promise<AdminNomenclatureDetail | null>;
  update(input: { itemId: string; expectedVersion: number; itemType: ExternalNomenclatureItemType; manufacturer: string | null; model: string | null; name: string; category: string | null; unit: string; specification: string | null; status: Exclude<NomenclatureCurationStatus, "duplicate">; reason: string }): Promise<number>;
  markDuplicate(sourceItemId: string, canonicalItemId: string, reason: string): Promise<string>;
}
