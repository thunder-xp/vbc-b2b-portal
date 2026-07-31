import type { PartnerSearchRepository } from "../repositories/partner-search.repository";
import type { PartnerSearchDocumentType, PartnerSearchGroup } from "../types";

const GROUP_ORDER: readonly PartnerSearchDocumentType[] = [
  "product",
  "purchasing_list",
  "estimate",
  "proposal",
  "manual_line",
  "template",
];

const GROUP_LABELS: Record<PartnerSearchDocumentType, string> = {
  product: "Товары",
  purchasing_list: "Списки закупок и избранное",
  estimate: "Сметы",
  proposal: "Коммерческие предложения",
  manual_line: "Ручные позиции смет",
  template: "Шаблоны",
};

export class PartnerSearchService {
  constructor(private readonly repository: PartnerSearchRepository) {}

  async search(companyId: string, rawQuery: string): Promise<PartnerSearchGroup[]> {
    const query = normalizeSearchQuery(rawQuery);
    if (query.length < 2) return [];
    const results = await this.repository.search(companyId, query, 40);
    return GROUP_ORDER.flatMap((type) => {
      const grouped = results.filter((result) => result.documentType === type);
      return grouped.length ? [{ type, label: GROUP_LABELS[type], results: grouped }] : [];
    });
  }
}

export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}
