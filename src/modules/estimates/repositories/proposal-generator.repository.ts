import type { AddEstimateLineInput, ExternalNomenclatureRecord } from "./estimate.repository";
import type { EstimateSectionSystemKey } from "../types";
type GeneratorResolutionKind = "unresolved" | "catalog" | "service" | "own_nomenclature" | "shared_nomenclature";

export type GeneratorServiceRecord = {
  id: string;
  name: string;
  unit: AddEstimateLineInput["unit"];
  defaultCost: number | null;
  defaultSellingPrice: number | null;
};

export type GeneratorProfileMapping = {
  profileKey: string;
  label: string;
  sectionKey: EstimateSectionSystemKey;
  unit: AddEstimateLineInput["unit"];
  version: number;
  resolution: GeneratorResolutionKind;
  resolvedId: string | null;
  resolvedLabel: string | null;
  defaultSellingUnitPrice: number | null;
  defaultSellingCurrencyCode: string | null;
  defaultSellingVatMode: "included" | "excluded" | null;
};

export type GeneratorProfileAdminRow = GeneratorProfileMapping & {
  systemType: "cctv";
  isActive: boolean;
};

export type GeneratorPreparedLine = AddEstimateLineInput & {
  sectionKey: EstimateSectionSystemKey;
  externalNomenclatureId?: string | null;
  resolution: GeneratorResolutionKind;
  profileKey?: string | null;
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
    resolvedServiceCount: number;
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
    resolutionCounts?: { catalog: number; service: number; own: number; shared: number; unresolved: number };
  }): Promise<string>;
  resolveCalculatorProfiles(companyId: string, profileKeys: string[]): Promise<GeneratorProfileMapping[]>;
  resolveExternalNomenclature(companyId: string, ids: string[]): Promise<ExternalNomenclatureRecord[]>;
  resolveServices(companyId: string, ids: string[]): Promise<GeneratorServiceRecord[]>;
  createEstimate(input: {
    companyId: string;
    sessionId: string;
    finalCustomerId: string;
    name: string;
    projectName: string | null;
    currencyCode: string;
    vatMode: "none" | "included";
    validityDays: number;
    requestKey: string;
    fingerprint: string;
    lines: GeneratorPreparedLine[];
  }): Promise<string>;
  submitFeedback(input: { sessionId: string; answer: "yes" | "partial" | "no"; comment: string | null }): Promise<string>;
  canPromptFeedback(sessionId: string, estimateId: string): Promise<boolean>;
  getAdminReport(limit: number): Promise<GeneratorAdminReport>;
  listCalculatorProfiles(): Promise<GeneratorProfileAdminRow[]>;
  searchCalculatorTargets(query: string, limit: number): Promise<Array<{ targetType: "catalog" | "service" | "external_nomenclature"; id: string; label: string; secondary: string | null }>>;
  updateCalculatorProfile(input: { profileKey: string; expectedVersion: number; targetType: "catalog" | "service" | "external_nomenclature" | "unresolved"; targetId: string | null }): Promise<number>;
  updateCalculatorServicePrice(input: {
    profileKey: string;
    expectedVersion: number;
    unitPrice: number | null;
    currencyCode: string | null;
    vatMode: "included" | "excluded" | null;
  }): Promise<number>;
}
