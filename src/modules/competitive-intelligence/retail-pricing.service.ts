import "server-only";

import { createHash } from "node:crypto";

import type { ProductCommercialViewDto } from "../pricing-inventory";
import { matchExternalPriceRows } from "../external-prices/matching";
import { analyzeExternalPriceSpreadsheet, ExternalPriceSpreadsheetError } from "../external-prices/spreadsheet-parser";
import type { ExternalPriceColumnMapping, ExternalPriceFileFormat } from "../external-prices/types";
import { buildProductCompetitorPricing } from "./service";
import { CompetitorRetailPricingRepository } from "./retail-pricing.repository";
import type { AdminCompetitorRetailImportDetail, AdminCompetitorRetailImportRow } from "./types";

export class CompetitorRetailPricingService {
  constructor(private readonly repository = new CompetitorRetailPricingRepository()) {}

  async getImport(importId: string): Promise<AdminCompetitorRetailImportDetail | null> {
    const detail = await this.repository.getImport(importId);
    if (!detail || detail.rows.length || detail.candidateRows === 0) return detail;
    try {
      const source = await this.repository.getMigratedImportSource(importId);
      if (!source) return detail;
      const bytes = await this.repository.download(source.bucket, source.key);
      if (createHash("sha256").update(bytes).digest("hex") !== source.hash) throw new ExternalPriceSpreadsheetError("SOURCE_FILE_HASH_MISMATCH");
      const mapping = mappingValue(source.confirmedMapping);
      if (!mapping) return detail;
      const analysis = analyzeExternalPriceSpreadsheet({ bytes, format: source.format, priceSchema: "retail", mapping });
      const matches = matchExternalPriceRows(analysis.rows, await this.repository.listCandidates());
      const rows = buildMigratedRetailImportRows(importId, source.currency, matches, source.observations);
      return { ...detail, rows: await this.repository.attachMappedProducts(rows) };
    } catch (error) {
      console.error({
        event: "competitor_retail_legacy_detail_failed", importId,
        safeErrorCode: error instanceof ExternalPriceSpreadsheetError ? error.code : "LEGACY_DETAIL_FAILED",
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return detail;
    }
  }

  async getProductPricing(companyId: string, productId: string, commercialView?: ProductCommercialViewDto) {
    const read = await this.repository.getProductPricing(companyId, productId);
    return buildProductCompetitorPricing(read as never, commercialView);
  }

  async processNextImport() {
    const startedAt = performance.now();
    const job = await this.repository.claimJob();
    if (!job) return { status: "idle" as const, durationMs: Math.round(performance.now() - startedAt) };
    const importId = required(job.id), competitorId = required(job.competitorId), correlationId = required(job.correlationId);
    try {
      const bytes = await this.repository.download(required(job.storageBucket), required(job.storageKey));
      if (createHash("sha256").update(bytes).digest("hex") !== required(job.sourceFileHash)) {
        throw new ExternalPriceSpreadsheetError("SOURCE_FILE_HASH_MISMATCH");
      }
      const mapping = mappingValue(job.confirmedMapping);
      const analysis = analyzeExternalPriceSpreadsheet({
        bytes,
        format: required(job.fileFormat) as ExternalPriceFileFormat,
        priceSchema: "retail",
        mapping,
      });
      if (!mapping) {
        await this.repository.requireMapping(importId, { ...analysis.detectedMapping, partnerPrice: null }, analysis);
        return { status: "mapping_required" as const, importId, durationMs: Math.round(performance.now() - startedAt) };
      }
      const matches = matchExternalPriceRows(analysis.rows, await this.repository.listCandidates());
      await this.repository.saveMatches(importId, competitorId, required(job.currency), matches, analysis);
      return { status: "ready_for_review" as const, importId, durationMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      const code = error instanceof ExternalPriceSpreadsheetError ? error.code : "ANALYSIS_FAILED";
      await this.repository.failJob(importId, competitorId, correlationId, code);
      console.error({ event: "competitor_retail_import_failed", importId, safeErrorCode: code, errorType: error instanceof Error ? error.name : typeof error });
      return { status: "failed" as const, importId, durationMs: Math.round(performance.now() - startedAt) };
    }
  }
}

export function buildMigratedRetailImportRows(
  importId: string,
  currency: string,
  matches: ReturnType<typeof matchExternalPriceRows>,
  observations: Array<{ sheet: string; row: number; productId: string }>,
): AdminCompetitorRetailImportRow[] {
  const observed = new Map(observations.map((item) => [`${item.sheet}:${item.row}`, item.productId]));
  return matches.flatMap((match) => {
    if (match.retailPrice === null) return [];
    const key = `${match.sheet}:${match.row}`;
    const productId = observed.get(key) ?? null;
    return [{
      id: `${importId}:${key}`, competitorProductId: `${importId}:${key}`, sku: match.sourceCode,
      model: match.normalizedModel, name: match.sourceName, description: match.description,
      price: match.retailPrice, currency, sheet: match.sheet, row: match.row, productId,
      matchMethod: productId ? "legacy_observation" : match.matchMethod,
      status: productId ? "mapped" : match.matchStatus === "needs_review" ? "ignored" : "unmapped",
      suggestions: match.suggestedProducts,
    } satisfies AdminCompetitorRetailImportRow];
  });
}

function required(value: unknown) { if (typeof value !== "string" || !value) throw new Error("INVALID_JOB"); return value; }
function mappingValue(value: unknown): ExternalPriceColumnMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapping = value as ExternalPriceColumnMapping;
  return typeof mapping.productName === "string" && typeof mapping.retailPrice === "string" ? mapping : null;
}
