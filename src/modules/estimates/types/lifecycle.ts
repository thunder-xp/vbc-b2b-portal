import type { CustomerProposalDto } from "./proposal";
import type { ProposalDeliverySummaryDto } from "./delivery";
import type { EstimateLifecycleStatus, EstimateRejectionReason } from "./estimate";

export type EstimateVersionStatus = "prepared" | "sent" | "accepted" | "rejected" | "archived";
export type EstimateSentChannel = "email" | "messenger" | "printed" | "other";

export type EstimateVersion = {
  id: string;
  estimateId: string;
  companyId: string;
  versionNumber: number;
  estimateRevision: number;
  status: EstimateVersionStatus;
  estimateNumber: string;
  currencyCode: string;
  totalAmount: number;
  snapshot: EstimateVersionSnapshot;
  customerProposalSnapshot: CustomerProposalDto;
  proposalTemplateId: string | null;
  note: string | null;
  changeReason: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  sentAt: string | null;
  sentChannel: EstimateSentChannel | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  rejectionReasonCode?: EstimateRejectionReason | null;
};

export type EstimateVersionSnapshot = {
  estimate: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
};

export type EstimateVersionListItemDto = {
  id: string;
  estimateNumber?: string;
  versionNumber: number;
  estimateRevision: number;
  label: string;
  status: EstimateVersionStatus;
  statusLabel: string;
  total: string;
  currencyCode: string;
  note: string | null;
  createdAt: string;
  createdByName: string;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  pdfDocumentId: string | null;
  pdfStatus: "queued" | "generating" | "ready" | "failed" | null;
  deliveries: ProposalDeliverySummaryDto[];
  deliveryDefaults?: { recipientName: string; subject: string; message: string };
};

export type EstimateWorkflowDto = {
  estimateId: string;
  customer?: { id: string; displayName: string; primaryEmail: string | null; revision: number } | null;
  estimateStatus: "draft" | "ready" | "archived";
  lifecycleStatus?: EstimateLifecycleStatus;
  lifecycleExpiresAt?: string | null;
  lifecycleRejectionReason?: EstimateRejectionReason | null;
  lifecycleOrderId?: string | null;
  acceptedVersionId: string | null;
  emailDeliveryAvailable: boolean;
  guidedState: EstimateGuidedStateDto;
  draftReadiness: EstimateDraftReadinessDto;
  permissions: {
    canManage: boolean;
    canSend: boolean;
    canConvert: boolean;
    canManageOrders: boolean;
  };
  versions: EstimateVersionListItemDto[];
  readiness: EstimateReadinessDto;
};

export type EstimateReadinessCheckCode =
  | "has_lines"
  | "valid_quantities"
  | "complete_prices"
  | "valid_currency"
  | "calculated_total";

export type EstimateReadinessCheck = {
  code: EstimateReadinessCheckCode;
  label: string;
  passed: boolean;
  lineId?: string | null;
};

export type EstimateReadinessDto = {
  ready: boolean;
  checks: EstimateReadinessCheck[];
};

export type EstimateDraftReadinessState =
  | "not_applicable"
  | "add_product"
  | "fix_quantity"
  | "fix_price"
  | "fix_line"
  | "fix_settings"
  | "save_changes"
  | "prepare_proposal"
  | "prepare_pdf"
  | "handoff";

export type EstimateDraftReadinessPrimaryAction =
  | "add_product"
  | "focus_line"
  | "open_settings"
  | "save"
  | "prepare_proposal"
  | "generate_pdf";

export type EstimateDraftReadinessTarget =
  | { kind: "product_picker" }
  | { kind: "line"; lineId: string; field: "quantity" | "price" | "details" }
  | { kind: "settings"; field: "currency" | "commercial" }
  | { kind: "charges" }
  | null;

export type EstimateDraftReadinessDto = EstimateReadinessDto & {
  state: EstimateDraftReadinessState;
  primaryAction: EstimateDraftReadinessPrimaryAction | null;
  target: EstimateDraftReadinessTarget;
  linePosition: number | null;
};

export type EstimateGuidedState =
  | "draft"
  | "ready_to_send"
  | "awaiting_customer"
  | "awaiting_customer_opened"
  | "expired"
  | "accepted_ready_to_order"
  | "resume_checkout"
  | "accepted_already_converted"
  | "rejected"
  | "converted_to_order";

export type EstimateGuidedPrimaryAction =
  | "send"
  | "update"
  | "continue_order"
  | "resume_checkout"
  | "open_order";

export type EstimateGuidedSecondaryAction =
  | "preview"
  | "pdf"
  | "send"
  | "resend"
  | "delivery_history"
  | "mark_ready"
  | "duplicate"
  | "save_template"
  | "mark_sent"
  | "record_response";

export type EstimateGuidedStateDto = {
  state: EstimateGuidedState;
  primaryAction: EstimateGuidedPrimaryAction | null;
  secondaryActions: EstimateGuidedSecondaryAction[];
  resumeCartId: string | null;
};

export type EstimateCartConversionSummary = {
  cartId: string;
  added: number;
  updated: number;
  unavailable: number;
  inactive: number;
  missingPrice: number;
  skipped: number;
  changedPrice: number;
};
