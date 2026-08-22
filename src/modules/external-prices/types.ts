export type ExternalPriceFileFormat = "xlsx" | "csv";
export type ExternalPriceSchema = "partner" | "retail" | "both" | "detect";
export type ExternalPriceSnapshotScope = "full" | "partial";
export type ExternalPriceUploadStatus =
  | "uploaded"
  | "analyzing"
  | "mapping_required"
  | "ready_for_review"
  | "applied"
  | "failed"
  | "archived";

export type ExternalPriceColumnMapping = {
  productCode?: string | null;
  productName: string;
  description?: string | null;
  partnerPrice?: string | null;
  retailPrice?: string | null;
};

export type ExternalPriceDetectedMapping = ExternalPriceColumnMapping & {
  signature: string;
  confidence: "high" | "medium" | "low";
};

export type ParsedExternalPriceRow = {
  sheet: string;
  row: number;
  sourceCode: string | null;
  sourceName: string;
  normalizedModel: string | null;
  description: string | null;
  partnerPrice: number | null;
  retailPrice: number | null;
  marker: string | null;
};

export type SpreadsheetAnalysis = {
  sheetNames: string[];
  totalRows: number;
  candidateRows: number;
  ignoredRows: number;
  markerRows: number;
  detectedMapping: ExternalPriceDetectedMapping;
  rows: ParsedExternalPriceRow[];
};

export type CatalogMatchCandidate = {
  id: string;
  sku: string;
  name: string;
  normalizedModel: string;
  aliases: string[];
};

export type ExternalPriceMatch = ParsedExternalPriceRow & {
  catalogProductId: string | null;
  matchMethod: "exact_model" | "known_alias" | "suggested" | "none";
  matchStatus: "matched" | "matched_alias" | "needs_review" | "unmatched";
  suggestedProducts: Array<{ id: string; sku: string; name: string }>;
};

export type ExternalPriceSourceDto = {
  id: string;
  code: string;
  displayName: string;
  sourceType: string;
  supportedBrandScope: string[];
};

export type ExternalPriceUploadSummary = {
  id: string;
  source_name: string;
  original_filename: string;
  effective_date: string | null;
  currency: string;
  price_schema: ExternalPriceSchema;
  snapshot_scope: ExternalPriceSnapshotScope;
  status: ExternalPriceUploadStatus;
  total_rows: number;
  candidate_rows: number;
  matched_rows: number;
  review_rows: number;
  unmatched_rows: number;
  ignored_rows: number;
  marker_rows: number;
  safe_error_code: string | null;
  created_at: string;
  applied_at: string | null;
};

export type CurrentExternalPriceDto = {
  sourceId: string;
  sourceName: string;
  priceType: "partner" | "retail";
  amount: number;
  currency: string;
  observedAt: string;
};
