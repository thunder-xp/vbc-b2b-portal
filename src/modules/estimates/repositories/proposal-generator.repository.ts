import type { AddEstimateLineInput, ExternalNomenclatureRecord } from "./estimate.repository";
import type { EstimateSectionSystemKey } from "../types";
type GeneratorResolutionKind = "unresolved" | "catalog" | "own_nomenclature" | "shared_nomenclature";

export type GeneratorProfileMapping = {
  profileKey: string;
  label: string;
  sectionKey: EstimateSectionSystemKey;
  unit: AddEstimateLineInput["unit"];
  version: number;
  resolution: GeneratorResolutionKind;
  resolvedId: string | null;
  resolvedLabel: string | null;
};

export type GeneratorProfileAdminRow = GeneratorProfileMapping & {
  systemType: "cctv";
  isActive: boolean;
};

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
    descriptionStarts: number;
    quickCalculationStarts: number;
    descriptionEstimatesCreated: number;
    quickCalculationEstimatesCreated: number;
    quickCalculationCompleted: number;
    quickCalculationUnresolvedCount: number;
    averageQuickCalculationToEstimateMs: number;
  };
  comments: Array<{ answer: "yes" | "partial" | "no"; comment: string; created_at: string }>;
  quickCalculationByObjectType: Array<{ objectType: string; starts: number; estimatesCreated: number }>;
};

export interface ProposalGeneratorRepository {
  recordSession(input: {
    companyId: string; requestKey: string; fingerprint: string; requirementCount: number; durationMs: number; failed?: boolean;
    generationMode?: "description" | "quick_calculation"; structuredFacts?: {
      systemType: "cctv"; objectType: string; indoorCameraCount: number; outdoorCameraCount: number;
      archiveDays: number; cableLength: number; installationRequested: boolean; commissioningRequested: boolean;
      remoteViewingRequested: boolean; advancedFlags: string[];
    } | null;
    resolutionCounts?: { catalog: number; own: number; shared: number; unresolved: number };
  }): Promise<string>;
  resolveCalculatorProfiles(companyId: string, profileKeys: string[]): Promise<GeneratorProfileMapping[]>;
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
  listCalculatorProfiles(): Promise<GeneratorProfileAdminRow[]>;
  searchCalculatorTargets(query: string, limit: number): Promise<Array<{ targetType: "catalog" | "external_nomenclature"; id: string; label: string; secondary: string | null }>>;
  updateCalculatorProfile(input: { profileKey: string; expectedVersion: number; targetType: "catalog" | "external_nomenclature" | "unresolved"; targetId: string | null }): Promise<number>;
}
