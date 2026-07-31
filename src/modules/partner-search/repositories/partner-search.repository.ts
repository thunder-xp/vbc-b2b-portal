import type { PartnerSearchResult } from "../types";

export interface PartnerSearchRepository {
  search(companyId: string, query: string, limit: number): Promise<PartnerSearchResult[]>;
}
