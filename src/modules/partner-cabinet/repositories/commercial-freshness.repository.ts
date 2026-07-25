export type CommercialFreshnessDomain = "rates" | "prices" | "stock" | "arrivals";

export type CommercialFreshnessRecord = {
  domain: CommercialFreshnessDomain;
  updatedAt: string | null;
};

export interface CommercialFreshnessReadModel {
  getFreshness(): Promise<CommercialFreshnessRecord[]>;
}
