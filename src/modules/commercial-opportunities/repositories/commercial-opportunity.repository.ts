import type { CommercialOpportunityFilter, CommercialOpportunityPage } from "../types";

export interface CommercialOpportunityRepository {
  list(input: { companyId: string; filter: CommercialOpportunityFilter; limit: number; offset: number }): Promise<CommercialOpportunityPage>;
  dismiss(opportunityId: string): Promise<void>;
}

export class CommercialOpportunityRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Commercial opportunities are unavailable.");
    this.name = "CommercialOpportunityRepositoryError";
  }
}
