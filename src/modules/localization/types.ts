export const LOCALIZATION_ENTITY_TYPES = ["category", "product"] as const;
export const LOCALIZATION_STATUSES = ["missing", "machine_draft", "reviewed", "outdated"] as const;

export type LocalizationEntityType = (typeof LOCALIZATION_ENTITY_TYPES)[number];
export type LocalizationStatus = (typeof LOCALIZATION_STATUSES)[number];
export type LocalizationMutationAction = "save_draft" | "review" | "revert_machine_draft";

export type LocalizationContent = {
  localizedName: string | null;
  shortDescription?: string | null;
  description?: string | null;
  intro?: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type LocalizationWorkbenchItem = {
  id: string;
  sku: string | null;
  sourceName: string;
  sourceDescription: string | null;
  currentHash: string;
  localizationId: string | null;
  localizedName: string | null;
  localizedDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  translationStatus: Exclude<LocalizationStatus, "missing"> | null;
  sourceHash: string | null;
  outdatedAgainstHash: string | null;
  translationVersion: number | null;
  revision: number | null;
  translatedAt: string | null;
  reviewedAt: string | null;
  machineDraftContent: LocalizationContent | null;
  effectiveStatus: LocalizationStatus;
};

export type LocalizationSummary = {
  missingProducts: number;
  machineDraftProducts: number;
  reviewedProducts: number;
  outdatedProducts: number;
  missingCategories: number;
  machineDraftCategories: number;
  reviewedCategories: number;
  outdatedCategories: number;
  queuedJobs: number;
  failedJobs: number;
  lastRun: {
    status: string;
    claimed_count: number;
    completed_count: number;
    failed_count: number;
    stale_count: number;
    duration_ms: number | null;
    started_at: string;
    completed_at: string | null;
  } | null;
};

export type LocalizationWorkbenchPage = {
  items: LocalizationWorkbenchItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: LocalizationSummary;
};

export type TranslationJob = {
  id: string;
  entityType: LocalizationEntityType;
  entityId: string;
  locale: string;
  sourceHash: string;
  source: Record<string, unknown>;
};

export type ClaimedTranslationBatch = {
  runId: string;
  jobs: TranslationJob[];
  terminology: Record<string, string>;
};
