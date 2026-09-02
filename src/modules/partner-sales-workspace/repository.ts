import type { EstimateSalesOpportunitySource } from "./types";

export interface EstimateSalesOpportunityRepository {
  listCurrent(companyId: string, limit: number): Promise<EstimateSalesOpportunitySource[]>;
}
