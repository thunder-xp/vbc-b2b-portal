import type { EstimateLifecycleStatus, EstimateStatus, EstimateVersionStatus } from "../estimates/types";

export type EstimateSalesOpportunityType = "resume_checkout" | "accepted_ready_to_order" | "ready_to_send" | "awaiting_customer";
export type EstimateFollowUpState = "sent" | "sent_not_opened" | "sent_opened_no_response" | "expired_sent";
export type EstimateOpportunityAction = "resume_checkout" | "continue_order" | "open_and_send" | "resend" | "review" | "update";

export type EstimateDeliveryEvidence = {
  status: "queued" | "sending" | "sent" | "delivered" | "failed" | "revoked" | "responded";
  sentAt: string | null;
  openedAt: string | null;
  expiresAt: string;
  response: "accepted" | "rejected" | null;
  createdAt: string;
};

export type EstimateCartConversionEvidence = {
  versionId: string | null;
  requestKey: string;
  createdBy: string;
  direction: "cart_to_estimate" | "estimate_to_cart";
  cart: null | {
    id: string;
    companyId: string;
    createdBy: string;
    status: "active" | "submitting" | "converted" | "abandoned";
    items: Array<{ productId: string; quantity: number }>;
  };
};

export type EstimateSalesOpportunitySource = {
  versionId: string;
  estimateId: string;
  estimateNumber: string;
  proposalName: string;
  customerName: string | null;
  projectName: string | null;
  amount: number;
  currency: string;
  versionStatus: EstimateVersionStatus;
  estimateStatus: EstimateStatus;
  estimateLifecycleStatus: EstimateLifecycleStatus;
  acceptedVersionId: string | null;
  sentAt: string | null;
  lifecycleExpiresAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  readyDocumentId: string | null;
  productRequirements: Array<{ productId: string; quantity: number }>;
  cartConversions: EstimateCartConversionEvidence[];
  latestDelivery: EstimateDeliveryEvidence | null;
};

export type EstimateSalesOpportunityPermissions = {
  canView: boolean;
  canSend: boolean;
  canConvert: boolean;
  canManageOrders: boolean;
};

export type PartnerEstimateSalesOpportunity = {
  id: string;
  type: EstimateSalesOpportunityType;
  priority: 1 | 2 | 3 | 4;
  estimateId: string;
  versionId: string;
  estimateNumber: string;
  proposalName: string;
  customerName: string | null;
  projectName: string | null;
  amount: number;
  currency: string;
  waitingSince: string;
  validUntil: string | null;
  followUpState: EstimateFollowUpState | null;
  action: EstimateOpportunityAction;
  href: string;
};
