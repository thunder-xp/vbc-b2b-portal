import type { CustomerProposalDto, GeneratedEstimateDocument, ProposalBranding, ProposalSettings, ProposalTemplate } from "../types";

export interface ProposalRepository {
  listTemplates(companyId: string): Promise<ProposalTemplate[]>;
  getBranding(companyId: string): Promise<Partial<ProposalBranding> | null>;
  getProductImages(productIds: string[]): Promise<Map<string, string | null>>;
  saveSettings(input: { estimateId: string; expectedRevision: number; templateId: string | null; settings: ProposalSettings }): Promise<number>;
  copyTemplate(input: { companyId: string; sourceTemplateId: string; name: string }): Promise<ProposalTemplate>;
  claimGeneration(input: { estimateId: string; estimateRevision: number; templateId: string | null; fingerprint: string; dto: CustomerProposalDto }): Promise<GeneratedEstimateDocument>;
  markGenerating(documentId: string): Promise<void>;
  markReady(input: { documentId: string; bucket: string; key: string; pageCount: number; fileSizeBytes: number; checksumSha256: string }): Promise<void>;
  markFailed(documentId: string, safeError: string): Promise<void>;
  findDocument(documentId: string): Promise<GeneratedEstimateDocument | null>;
  uploadPdf(bucket: string, key: string, data: Uint8Array): Promise<void>;
  downloadPdf(bucket: string, key: string): Promise<Uint8Array>;
}

export class ProposalRepositoryError extends Error {
  constructor() { super("Proposal persistence failed."); this.name = "ProposalRepositoryError"; }
}
