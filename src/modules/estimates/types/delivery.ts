import type { CustomerProposalDto } from "./proposal";

export type ProposalDeliveryStatus = "queued" | "sending" | "sent" | "delivered" | "failed" | "revoked" | "responded";
export type ProposalCustomerResponse = "accepted" | "rejected";
export type ProposalDeliveryLocale = "ru" | "ro";

export type ProposalDelivery = {
  id: string;
  companyId: string;
  estimateId: string;
  versionId: string;
  generatedDocumentId: string;
  recipientEmail: string;
  recipientName: string | null;
  emailSubject: string;
  messageBody: string | null;
  locale: ProposalDeliveryLocale;
  status: ProposalDeliveryStatus;
  idempotencyKey: string;
  tokenHash: string;
  tokenExpiresAt: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
  safeError: string | null;
  revokedAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  respondedAt: string | null;
  response: ProposalCustomerResponse | null;
  responseName: string | null;
  responseNote: string | null;
};

export type ProposalDeliverySummaryDto = {
  id: string;
  recipient: string;
  status: ProposalDeliveryStatus;
  statusLabel: string;
  sentAt: string | null;
  openedAt: string | null;
  expiresAt: string;
  response: ProposalCustomerResponse | null;
};

export type PublicProposalDto = {
  deliveryId: string;
  companyId: string;
  estimateId: string;
  versionId: string;
  status: ProposalDeliveryStatus;
  locale: ProposalDeliveryLocale;
  expiresAt: string;
  respondedAt: string | null;
  response: ProposalCustomerResponse | null;
  proposal: CustomerProposalDto;
  documentId: string;
  documentStatus: "ready";
  documentSize: number | null;
};
