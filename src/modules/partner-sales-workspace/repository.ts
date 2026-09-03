import type { EstimateSalesOpportunitySource } from "./types";

export interface EstimateSalesOpportunityRepository {
  listCurrent(companyId: string, userId: string, limit: number): Promise<EstimateSalesOpportunitySource[]>;
}
