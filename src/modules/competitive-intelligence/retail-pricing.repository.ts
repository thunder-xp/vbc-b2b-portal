import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { CatalogMatchCandidate, ExternalPriceMatch } from "../external-prices/types";
import { normalizeCompetitorName } from "./service";
import type {
  AdminCompetitorRetailImportDetail,
  AdminCompetitorRetailImportList,
  AdminCompetitorRetailImportRow,
} from "./types";

type JsonRecord = Record<string, unknown>;

export class CompetitorRetailPricingRepositoryError extends Error {
  constructor(public readonly code: string | null) {
    super("Competitor retail pricing operation failed.");
    this.name = "CompetitorRetailPricingRepositoryError";
  }
}

export class CompetitorRetailPricingRepository {
  async listImports(): Promise<AdminCompetitorRetailImportList> {
    const { data, error } = await (await createClient()).rpc("list_admin_competitor_retail_imports", { p_limit: 50 });
    if (error || !record(data)) throw new CompetitorRetailPricingRepositoryError(error?.code ?? null);
    return data as unknown as AdminCompetitorRetailImportList;
  }

  async getImport(importId: string): Promise<AdminCompetitorRetailImportDetail | null> {
    const { data, error } = await (await createClient()).rpc("get_admin_competitor_retail_import", { p_import_id: importId });
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
    if (!record(data)) return null;
    const detail = data as unknown as AdminCompetitorRetailImportDetail;
    const rows = detail.rows.length ? detail.rows : await this.listMigratedLegacyRows(importId);
    return { ...detail, rows: await this.attachMappedProducts(rows) };
  }

  private async listMigratedLegacyRows(importId: string): Promise<AdminCompetitorRetailImportRow[]> {
    const admin = createAdminClient();
    const { data: imported, error: importError } = await admin.from("competitor_retail_price_imports")
      .select("legacy_external_price_upload_id").eq("id", importId).maybeSingle();
    if (importError) throw new CompetitorRetailPricingRepositoryError(importError.code);
    const legacyUploadId = text(imported?.legacy_external_price_upload_id);
    if (!legacyUploadId) return [];
    const { data: rows, error } = await admin.from("external_price_import_rows")
      .select("id,source_sheet,source_row,source_product_code,source_product_name,normalized_model,source_description,retail_price,currency,catalog_product_id,match_method,match_status,suggested_products")
      .eq("upload_id", legacyUploadId).not("retail_price", "is", null)
      .order("source_sheet").order("source_row").limit(500);
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
    return (rows ?? []).flatMap(mapMigratedLegacyRow);
  }

  private async attachMappedProducts(rows: AdminCompetitorRetailImportRow[]): Promise<AdminCompetitorRetailImportRow[]> {
    const ids = [...new Set(rows.flatMap((row) => row.productId ? [row.productId] : []))];
    if (!ids.length) return rows;
    const products = new Map<string, { id: string; sku: string; name: string }>();
    const admin = createAdminClient();
    for (let offset = 0; offset < ids.length; offset += 300) {
      const { data, error } = await admin.from("catalog_products").select("id,sku,name").in("id", ids.slice(offset, offset + 300));
      if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
      for (const product of data ?? []) products.set(product.id, { id: product.id, sku: product.sku, name: product.name });
    }
    return rows.map((row) => ({ ...row, mappedProduct: row.productId ? products.get(row.productId) ?? null : null }));
  }

  async createImport(input: {
    id: string; competitorId: string; fileName: string; storageKey: string; hash: string; format: string;
    size: number; effectiveDate: string; currency: string; snapshotScope: string;
  }) {
    const { data, error } = await (await createClient()).rpc("create_admin_competitor_retail_import", {
      p_import_id: input.id, p_competitor_id: input.competitorId, p_original_filename: input.fileName,
      p_storage_key: input.storageKey, p_source_file_hash: input.hash, p_file_format: input.format,
      p_file_size: input.size, p_effective_date: input.effectiveDate, p_currency: input.currency,
      p_snapshot_scope: input.snapshotScope,
    });
    if (error || !record(data)) throw new CompetitorRetailPricingRepositoryError(error?.code ?? null);
    return data;
  }

  async confirmMapping(importId: string, mapping: JsonRecord) {
    const { error } = await (await createClient()).rpc("confirm_admin_competitor_retail_mapping", { p_import_id: importId, p_mapping: mapping });
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
  }

  async reviewRow(importId: string, rowId: string, productId: string | null, ignore: boolean) {
    const { error } = await (await createClient()).rpc("review_admin_competitor_retail_row", {
      p_import_id: importId, p_row_id: rowId, p_product_id: productId, p_ignore: ignore,
    });
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
  }

  async apply(importId: string) {
    const { data, error } = await (await createClient()).rpc("apply_admin_competitor_retail_import", { p_import_id: importId });
    if (error || !record(data)) throw new CompetitorRetailPricingRepositoryError(error?.code ?? null);
    return data;
  }

  async archive(importId: string) {
    const { error } = await (await createClient()).rpc("archive_admin_competitor_retail_import", { p_import_id: importId });
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
  }

  async getProductPricing(companyId: string, productId: string): Promise<JsonRecord> {
    const { data, error } = await (await createClient()).rpc("get_partner_product_competitor_pricing", {
      p_company_id: companyId, p_product_id: productId,
    });
    if (error || !record(data)) throw new CompetitorRetailPricingRepositoryError(error?.code ?? null);
    return data;
  }

  async claimJob(): Promise<JsonRecord | null> {
    const { data, error } = await createAdminClient().rpc("claim_competitor_retail_price_import_job");
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
    return record(data) ? data : null;
  }

  async download(bucket: string, key: string) {
    const { data, error } = await createAdminClient().storage.from(bucket).download(key);
    if (error) throw new CompetitorRetailPricingRepositoryError(error.name);
    return new Uint8Array(await data.arrayBuffer());
  }

  async listCandidates(): Promise<CatalogMatchCandidate[]> {
    const { data, error } = await createAdminClient().rpc("list_competitor_catalog_match_candidates");
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
    return array(data).flatMap((value) => {
      if (!record(value)) return [];
      return [{ id: text(value.id), sku: text(value.sku), name: text(value.name), normalizedModel: text(value.normalizedModel), aliases: array(value.aliases).filter(isText) }];
    });
  }

  async requireMapping(importId: string, detectedMapping: JsonRecord, stats: ImportStats) {
    const { error } = await createAdminClient().from("competitor_retail_price_imports").update({
      detected_mapping: detectedMapping, sheet_names: stats.sheetNames, total_rows: stats.totalRows,
      candidate_rows: stats.candidateRows, ignored_rows: stats.ignoredRows, marker_rows: stats.markerRows,
      status: "mapping_required", analyzed_at: new Date().toISOString(), safe_error_code: null,
    }).eq("id", importId).eq("status", "analyzing");
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
  }

  async saveMatches(importId: string, competitorId: string, currency: string, matches: ExternalPriceMatch[], stats: ImportStats) {
    const admin = createAdminClient();
    const usable = matches.filter((match) => match.retailPrice !== null && match.retailPrice > 0);
    const identities = [...new Set(usable.map(identityKey))];
    const existing = new Map<string, JsonRecord>();
    for (let offset = 0; offset < identities.length; offset += 300) {
      const { data, error } = await admin.from("competitor_products").select("id,identity_key,mapped_novotech_product_id,mapping_status")
        .eq("competitor_id", competitorId).in("identity_key", identities.slice(offset, offset + 300));
      if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
      for (const row of data ?? []) if (record(row)) existing.set(text(row.identity_key), row);
    }
    const productRowsByIdentity = new Map(usable.map((match) => {
      const key = identityKey(match), current = existing.get(key);
      const governedProductId = current?.mapping_status === "mapped" ? text(current.mapped_novotech_product_id) : match.catalogProductId;
      return [key, {
        competitor_id: competitorId, identity_key: key, competitor_sku: match.sourceCode,
        competitor_model: match.normalizedModel, competitor_name: match.sourceName,
        mapped_novotech_product_id: governedProductId || null,
        mapping_status: governedProductId ? "mapped" : match.matchStatus === "needs_review" ? "ambiguous" : "unmapped",
      }] as const;
    }));
    const productRows = [...productRowsByIdentity.values()];
    const { data: products, error: productError } = await admin.from("competitor_products").upsert(productRows, {
      onConflict: "competitor_id,identity_key",
    }).select("id,identity_key,mapped_novotech_product_id,mapping_status");
    if (productError) throw new CompetitorRetailPricingRepositoryError(productError.code);
    const productsByKey = new Map((products ?? []).flatMap((row) => record(row) ? [[text(row.identity_key), row] as const] : []));

    const { error: deleteError } = await admin.from("competitor_retail_price_import_rows").delete().eq("import_id", importId);
    if (deleteError) throw new CompetitorRetailPricingRepositoryError(deleteError.code);
    const rows = usable.map((match) => {
      const product = productsByKey.get(identityKey(match));
      const mappedProductId = product?.mapping_status === "mapped" ? text(product.mapped_novotech_product_id) : null;
      return {
        import_id: importId, competitor_product_id: text(product?.id), source_sheet: match.sheet, source_row: match.row,
        competitor_sku: match.sourceCode, competitor_model: match.normalizedModel, competitor_name: match.sourceName,
        source_description: match.description, retail_price: match.retailPrice, currency,
        mapped_novotech_product_id: mappedProductId, match_method: match.matchMethod,
        match_status: mappedProductId ? "mapped" : match.matchStatus === "needs_review" ? "needs_review" : "unmapped",
        suggested_products: match.suggestedProducts,
      };
    });
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await admin.from("competitor_retail_price_import_rows").insert(rows.slice(offset, offset + 500));
      if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
    }
    const matched = rows.filter((row) => row.match_status === "mapped").length;
    const review = rows.filter((row) => row.match_status === "needs_review").length;
    const unmapped = rows.filter((row) => row.match_status === "unmapped").length;
    const { error } = await admin.from("competitor_retail_price_imports").update({
      status: "ready_for_review", sheet_names: stats.sheetNames, total_rows: stats.totalRows,
      candidate_rows: rows.length, ignored_rows: stats.ignoredRows, marker_rows: stats.markerRows,
      matched_rows: matched, review_rows: review, unmapped_rows: unmapped,
      analyzed_at: new Date().toISOString(), safe_error_code: null,
    }).eq("id", importId).eq("status", "analyzing");
    if (error) throw new CompetitorRetailPricingRepositoryError(error.code);
  }

  async failJob(importId: string, competitorId: string, correlationId: string, safeCode: string) {
    const admin = createAdminClient();
    await admin.from("competitor_retail_price_imports").update({ status: "failed", safe_error_code: safeCode.slice(0, 80) }).eq("id", importId);
    await admin.from("competitive_intelligence_events").insert({
      event_type: "retail_price_import_failed", competitor_id: competitorId, correlation_id: correlationId,
      safe_metadata: { importId, code: safeCode.slice(0, 80) },
    });
  }
}

type ImportStats = { sheetNames: string[]; totalRows: number; candidateRows: number; ignoredRows: number; markerRows: number };
function identityKey(value: ExternalPriceMatch) { return [value.sourceCode, value.normalizedModel, value.sourceName].map((item) => normalizeCompetitorName(item ?? "")).join("|"); }
function mapMigratedLegacyRow(value: unknown): AdminCompetitorRetailImportRow[] {
  if (!record(value) || typeof value.retail_price !== "number") return [];
  const status = text(value.match_status);
  return [{
    id: text(value.id), competitorProductId: text(value.id), sku: nullableText(value.source_product_code),
    model: nullableText(value.normalized_model), name: text(value.source_product_name) || text(value.normalized_model) || text(value.source_product_code) || "Без названия",
    description: nullableText(value.source_description), price: value.retail_price, currency: text(value.currency),
    sheet: text(value.source_sheet), row: Number(value.source_row), productId: nullableText(value.catalog_product_id),
    matchMethod: text(value.match_method), status: status === "matched" || status === "matched_alias" ? "mapped"
      : status === "ignored" || status === "skipped" ? "ignored" : status === "needs_review" ? "needs_review" : "unmapped",
    suggestions: array(value.suggested_products).flatMap((suggestion) => record(suggestion) ? [{ id: text(suggestion.id), sku: text(suggestion.sku), name: text(suggestion.name) }] : []),
  }];
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function isText(value: unknown): value is string { return typeof value === "string"; }
