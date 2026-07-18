import type { CustomerProposalDto } from "./proposal";
import type { ProposalDeliverySummaryDto } from "./delivery";

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
};

export type EstimateVersionSnapshot = {
  estimate: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
};

export type EstimateVersionListItemDto = {
  id: string;
  versionNumber: number;
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
  estimateStatus: "draft" | "ready" | "archived";
  acceptedVersionId: string | null;
  versions: EstimateVersionListItemDto[];
  readiness: { ready: boolean; checks: Array<{ label: string; passed: boolean }> };
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
