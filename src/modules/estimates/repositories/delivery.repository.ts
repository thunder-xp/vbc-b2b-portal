import type { ProposalCustomerResponse, ProposalDelivery, ProposalDeliveryLocale, PublicProposalDto } from "../types";

export interface ProposalDeliveryRepository {
  listByVersionIds(versionIds: string[]): Promise<ProposalDelivery[]>;
  claim(input: {
    versionId: string;
    documentId: string;
    recipientEmail: string;
    recipientName: string | null;
    subject: string;
    message: string | null;
    locale: ProposalDeliveryLocale;
    tokenHash: string;
    expiresAt: string;
    idempotencyKey: string;
  }): Promise<ProposalDelivery>;
  start(deliveryId: string): Promise<ProposalDelivery>;
  complete(deliveryId: string, providerMessageId: string | null): Promise<ProposalDelivery>;
  fail(deliveryId: string, safeError: string, category: string): Promise<ProposalDelivery>;
  revoke(deliveryId: string): Promise<ProposalDelivery>;
  findPublic(tokenHash: string): Promise<PublicProposalDto | null>;
  trackOpen(tokenHash: string): Promise<void>;
  respond(input: { tokenHash: string; response: ProposalCustomerResponse; name: string | null; note: string | null }): Promise<{ deliveryId: string; companyId: string; estimateId: string; versionId: string; response: ProposalCustomerResponse; respondedAt: string }>;
  downloadPublicDocument(documentId: string): Promise<Uint8Array>;
}

export class ProposalDeliveryRepositoryError extends Error {
  constructor(readonly code: string | null = null) {
    super("Proposal delivery persistence failed.");
    this.name = "ProposalDeliveryRepositoryError";
  }
}
