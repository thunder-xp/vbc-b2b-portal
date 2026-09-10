import {
  PartnerOrderIntegrationStatus,
  PartnerOrderStatus,
  type PartnerOrder,
} from "../types";

export type PartnerOrderReconciliationStateDto = {
  orderId: string;
  state:
    | "checking"
    | "unknown_retrying"
    | "confirmed_created"
    | "confirmed_not_created"
    | "manual_review_required"
    | "failed";
  external1cNumber: string | null;
};

export function projectPartnerOrderReconciliationState(
  order: PartnerOrder,
): PartnerOrderReconciliationStateDto {
  let state: PartnerOrderReconciliationStateDto["state"] = "failed";
  if (
    order.status === PartnerOrderStatus.Submitted
    && order.integrationStatus === PartnerOrderIntegrationStatus.Confirmed
  ) {
    state = "confirmed_created";
  } else if (
    order.integrationStatus === PartnerOrderIntegrationStatus.ConfirmedNotCreated
  ) {
    state = "confirmed_not_created";
  } else if (
    order.integrationStatus === PartnerOrderIntegrationStatus.ManualReviewRequired
  ) {
    state = "manual_review_required";
  } else if (
    order.integrationStatus === PartnerOrderIntegrationStatus.ReconciliationRequired
  ) {
    state = (order.reconciliationAttemptCount ?? 0) > 0
      ? "unknown_retrying"
      : "checking";
  } else if (order.status === PartnerOrderStatus.Processing) {
    state = "checking";
  }
  return {
    orderId: order.id,
    state,
    external1cNumber: order.external1cNumber,
  };
}
