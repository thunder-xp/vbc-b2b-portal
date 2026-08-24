import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type {
  CatalogMatchCandidate,
  CurrentExternalPriceDto,
  ExternalPriceColumnMapping,
  ExternalPriceMatch,
  ExternalPriceSourceDto,
  ExternalPriceUploadSummary,
} from "./types";

type JsonRecord = Record<string, unknown>;

export class ExternalPriceRepositoryError extends Error {
  constructor(public readonly code: string | null, message = "External price operation failed.") { super(message); this.name = "ExternalPriceRepositoryError"; }
}

export class ExternalPriceRepository {
  async listSources(companyId: string): Promise<ExternalPriceSourceDto[]> {
    const { data, error } = await (await createClient()).rpc("list_external_price_sources", { p_company_id: companyId });
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return array(data).flatMap(mapSource);
  }

  async listUploads(companyId: string): Promise<ExternalPriceUploadSummary[]> {
    const { data, error } = await (await createClient()).rpc("list_external_price_uploads", { p_company_id: companyId, p_limit: 50 });
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return array(data) as ExternalPriceUploadSummary[];
  }

  async getUpload(companyId: string, uploadId: string): Promise<JsonRecord | null> {
    const { data, error } = await (await createClient()).rpc("get_external_price_upload", { p_company_id: companyId, p_upload_id: uploadId });
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return record(data) ? data : null;
  }

  async createUpload(input: {
    companyId: string; sourceId: string; uploadId: string; originalFilename: string;
    storageKey: string; hash: string; format: string; size: number; effectiveDate: string | null;
    currency: string; priceSchema: string; snapshotScope: string;
  }): Promise<{ id: string; status: string; duplicate: boolean; storageKey: string }> {
    const { data, error } = await (await createClient()).rpc("create_external_price_upload", {
      p_company_id: input.companyId, p_source_id: input.sourceId, p_upload_id: input.uploadId,
      p_original_filename: input.originalFilename, p_storage_key: input.storageKey,
      p_source_file_hash: input.hash, p_file_format: input.format, p_file_size: input.size,
      p_effective_date: input.effectiveDate, p_currency: input.currency,
      p_price_schema: input.priceSchema, p_snapshot_scope: input.snapshotScope,
    });
    if (error || !record(data)) throw new ExternalPriceRepositoryError(error?.code ?? null);
    return { id: text(data.id), status: text(data.status), duplicate: data.duplicate === true, storageKey: text(data.storageKey) };
  }

  async confirmMapping(companyId: string, uploadId: string, mapping: ExternalPriceColumnMapping, saveTemplate: boolean): Promise<void> {
    const { error } = await (await createClient()).rpc("confirm_external_price_mapping", { p_company_id: companyId, p_upload_id: uploadId, p_mapping: mapping, p_save_template: saveTemplate });
    if (error) throw new ExternalPriceRepositoryError(error.code);
  }

  async startCorrection(input: { companyId: string; uploadId: string; mapping: ExternalPriceColumnMapping; priceSchema: string; snapshotScope: string; reason: string; correlationId: string }): Promise<JsonRecord> {
    const { data, error } = await (await createClient()).rpc("start_external_price_upload_correction", {
      p_company_id: input.companyId, p_upload_id: input.uploadId, p_mapping: input.mapping,
      p_price_schema: input.priceSchema, p_snapshot_scope: input.snapshotScope,
      p_reason: input.reason, p_correlation_id: input.correlationId,
    });
    if (error || !record(data)) throw new ExternalPriceRepositoryError(error?.code ?? null);
    return data;
  }

  async reviewRow(companyId: string, uploadId: string, rowId: string, productId: string | null, skip: boolean): Promise<JsonRecord> {
    const { data, error } = await (await createClient()).rpc("review_external_price_row", { p_company_id: companyId, p_upload_id: uploadId, p_row_id: rowId, p_catalog_product_id: productId, p_skip: skip });
    if (error || !record(data)) throw new ExternalPriceRepositoryError(error?.code ?? null);
    return data;
  }

  async apply(companyId: string, uploadId: string): Promise<JsonRecord> {
    const { data, error } = await (await createClient()).rpc("apply_external_price_upload", { p_company_id: companyId, p_upload_id: uploadId });
    if (error || !record(data)) throw new ExternalPriceRepositoryError(error?.code ?? null);
    return data;
  }

  async archive(companyId: string, uploadId: string): Promise<void> {
    const { error } = await (await createClient()).rpc("archive_external_price_upload", { p_company_id: companyId, p_upload_id: uploadId });
    if (error) throw new ExternalPriceRepositoryError(error.code);
  }

  async getCurrent(companyId: string, productId: string): Promise<CurrentExternalPriceDto[]> {
    const { data, error } = await (await createClient()).rpc("get_current_external_prices", { p_company_id: companyId, p_product_id: productId });
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return array(data).flatMap(mapCurrent);
  }

  async claimJob(): Promise<JsonRecord | null> {
    const { data, error } = await createAdminClient().rpc("claim_external_price_upload_job");
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return record(data) ? data : null;
  }

  async download(bucket: string, key: string): Promise<Uint8Array> {
    const { data, error } = await createAdminClient().storage.from(bucket).download(key);
    if (error) throw new ExternalPriceRepositoryError(error.name, "External price file download failed.");
    return new Uint8Array(await data.arrayBuffer());
  }

  async listCandidates(): Promise<CatalogMatchCandidate[]> {
    const { data, error } = await createAdminClient().rpc("list_dahua_catalog_match_candidates");
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return array(data).flatMap(mapCandidate);
  }

  async findTemplate(companyId: string, sourceId: string, signature: string): Promise<ExternalPriceColumnMapping | null> {
    const { data, error } = await createAdminClient().from("external_price_mapping_templates").select("column_mapping").eq("company_id", companyId).eq("external_price_source_id", sourceId).eq("signature", signature).eq("active", true).maybeSingle();
    if (error) throw new ExternalPriceRepositoryError(error.code);
    return record(data?.column_mapping) ? data.column_mapping as ExternalPriceColumnMapping : null;
  }

  async completeDetection(uploadId: string, input: { detectedMapping: object; sheetNames: string[]; totalRows: number; candidateRows: number; ignoredRows: number; markerRows: number }): Promise<void> {
    const { error } = await createAdminClient().from("external_price_uploads").update({ detected_mapping: input.detectedMapping, sheet_names: input.sheetNames, total_rows: input.totalRows, candidate_rows: input.candidateRows, ignored_rows: input.ignoredRows, marker_rows: input.markerRows, status: "mapping_required", analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", uploadId).eq("status", "analyzing");
    if (error) throw new ExternalPriceRepositoryError(error.code);
  }

  async useTemplate(uploadId: string, mapping: ExternalPriceColumnMapping): Promise<void> {
    const { error } = await createAdminClient().from("external_price_uploads").update({ confirmed_mapping: mapping }).eq("id", uploadId).eq("status", "analyzing");
    if (error) throw new ExternalPriceRepositoryError(error.code);
  }

  async saveMatches(uploadId: string, companyId: string, currency: string, matches: ExternalPriceMatch[], stats: { sheetNames: string[]; totalRows: number; candidateRows: number; ignoredRows: number; markerRows: number }): Promise<void> {
    const admin = createAdminClient();
    const { error: deleteError } = await admin.from("external_price_import_rows").delete().eq("upload_id", uploadId);
    if (deleteError) throw new ExternalPriceRepositoryError(deleteError.code);
    for (let index = 0; index < matches.length; index += 500) {
      const rows = matches.slice(index, index + 500).map((match) => ({ upload_id: uploadId, partner_company_id: companyId, source_sheet: match.sheet, source_row: match.row, source_product_code: match.sourceCode, source_product_name: match.sourceName, normalized_model: match.normalizedModel, source_description: match.description, partner_price: match.partnerPrice, retail_price: match.retailPrice, currency, source_marker: match.marker, catalog_product_id: match.catalogProductId, match_method: match.matchMethod, match_status: match.matchStatus, suggested_products: match.suggestedProducts }));
      const { error } = await admin.from("external_price_import_rows").insert(rows);
      if (error) throw new ExternalPriceRepositoryError(error.code);
    }
    const matchedRows = matches.filter((row) => row.matchStatus === "matched" || row.matchStatus === "matched_alias").length;
    const reviewRows = matches.filter((row) => row.matchStatus === "needs_review").length;
    const unmatchedRows = matches.filter((row) => row.matchStatus === "unmatched").length;
    const { error } = await admin.from("external_price_uploads").update({ status: "ready_for_review", sheet_names: stats.sheetNames, total_rows: stats.totalRows, candidate_rows: stats.candidateRows, ignored_rows: stats.ignoredRows, marker_rows: stats.markerRows, matched_rows: matchedRows, review_rows: reviewRows, unmatched_rows: unmatchedRows, analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", uploadId).eq("status", "analyzing");
    if (error) throw new ExternalPriceRepositoryError(error.code);
  }

  async failJob(uploadId: string, companyId: string, safeCode: string): Promise<void> {
    const admin = createAdminClient();
    await admin.from("external_price_uploads").update({ status: "failed", safe_error_code: safeCode.slice(0,80), updated_at: new Date().toISOString() }).eq("id", uploadId);
    await admin.from("external_price_events").insert({ upload_id: uploadId, partner_company_id: companyId, event_type: "analysis_failed", safe_metadata: { code: safeCode.slice(0,80) } });
  }

  async adminSummary(): Promise<JsonRecord> {
    const { data, error } = await (await createClient()).rpc("get_admin_competitive_pricing_summary");
    if (error || !record(data)) throw new ExternalPriceRepositoryError(error?.code ?? null);
    return data;
  }
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function mapSource(value: unknown): ExternalPriceSourceDto[] { if(!record(value))return[]; return [{id:text(value.id),code:text(value.code),displayName:text(value.displayName),sourceType:text(value.sourceType),supportedBrandScope:array(value.supportedBrandScope).filter((v):v is string=>typeof v==="string")}]; }
function mapCandidate(value: unknown): CatalogMatchCandidate[] { if(!record(value))return[]; return [{id:text(value.id),sku:text(value.sku),name:text(value.name),normalizedModel:text(value.normalizedModel),aliases:array(value.aliases).filter((v):v is string=>typeof v==="string")}]; }
function mapCurrent(value: unknown): CurrentExternalPriceDto[] { if(!record(value)||!['partner','retail'].includes(text(value.priceType)))return[]; return [{sourceId:text(value.sourceId),sourceName:text(value.sourceName),priceType:text(value.priceType) as 'partner'|'retail',amount:Number(value.amount),currency:text(value.currency),observedAt:text(value.observedAt)}]; }
