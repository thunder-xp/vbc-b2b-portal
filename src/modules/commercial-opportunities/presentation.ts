import type { CommercialOpportunity } from "./types";

export type OpportunityPresentationVariant = "wide" | "compact";

export function opportunityPresentationVariant(
  opportunity: CommercialOpportunity,
): OpportunityPresentationVariant {
  return opportunity.product ? "wide" : "compact";
}
