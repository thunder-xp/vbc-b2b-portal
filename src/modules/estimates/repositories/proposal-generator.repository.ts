import type { AddEstimateLineInput, ExternalNomenclatureRecord } from "./estimate.repository";
import type { EstimateSectionSystemKey } from "../types";
type GeneratorResolutionKind = "unresolved" | "catalog" | "own_nomenclature" | "shared_nomenclature";

export type GeneratorPreparedLine = AddEstimateLineInput & {
  sectionKey: EstimateSectionSystemKey;
  externalNomenclatureId?: string | null;
  resolution: GeneratorResolutionKind;
};

export type GeneratorAdminReport = {
  summary: {
    usageCount: number;
    generationCompleted: number;
    generationFailed: number;
    companiesCount: number;
    estimatesCreated: number;
    completionRate: number;
    generatorToEstimateConversionRate: number;
    averageGenerationDurationMs: number;
    averageGenerationToEstimateMs: number;
    averageGeneratedLines: number;
    resolvedCatalogCount: number;
    ownNomenclatureCount: number;
    sharedNomenclatureCount: number;
    unresolvedCount: number;
    feedbackYes: number;
    feedbackPartial: number;
    feedbackNo: number;
  };
  comments: Array<{ answer: "yes" | "partial" | "no"; comment: string; created_at: string }>;
};

export interface ProposalGeneratorRepository {
  recordSession(input: { companyId: string; requestKey: string; fingerprint: string; requirementCount: number; durationMs: number; failed?: boolean }): Promise<string>;
  resolveExternalNomenclature(companyId: string, ids: string[]): Promise<ExternalNomenclatureRecord[]>;
  createEstimate(input: {
    companyId: string;
    sessionId: string;
    finalCustomerId: string;
    name: string;
    projectName: string | null;
    currencyCode: string;
    validityDays: number;
    requestKey: string;
    fingerprint: string;
    lines: GeneratorPreparedLine[];
  }): Promise<string>;
  submitFeedback(input: { sessionId: string; answer: "yes" | "partial" | "no"; comment: string | null }): Promise<string>;
  canPromptFeedback(sessionId: string, estimateId: string): Promise<boolean>;
  getAdminReport(limit: number): Promise<GeneratorAdminReport>;
}
