import "server-only";

import { createHash } from "node:crypto";

import type { PartnerWorkspaceContext } from "../partner-cabinet/services";
import { matchExternalPriceRows } from "./matching";
import { ExternalPriceRepository } from "./repository";
import { analyzeExternalPriceSpreadsheet, ExternalPriceSpreadsheetError } from "./spreadsheet-parser";
import type { ExternalPriceColumnMapping, ExternalPriceFileFormat, ExternalPriceSchema } from "./types";

export class ExternalPriceService {
  constructor(private readonly repository = new ExternalPriceRepository()) {}

  assertCompanyContext(context: PartnerWorkspaceContext): string {
    if (context.accessState !== "active" || !context.companyId) throw new Error("EXTERNAL_PRICE_ACCESS_DENIED");
    const allowed = context.capabilities.navigation.some((item) => item.key === "external_prices");
    if (!allowed) throw new Error("EXTERNAL_PRICE_ACCESS_DENIED");
    return context.companyId;
  }

  async processNextJob(): Promise<{ status: "idle" | "mapping_required" | "ready_for_review" | "failed"; uploadId?: string; durationMs: number }> {
    const startedAt = performance.now();
    const job = await this.repository.claimJob();
    if (!job) return { status: "idle", durationMs: Math.round(performance.now() - startedAt) };
    const uploadId = requiredText(job.id);
    const companyId = requiredText(job.companyId);
    try {
      const bytes = await this.repository.download(requiredText(job.storageBucket), requiredText(job.storageKey));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== requiredText(job.sourceFileHash)) throw new ExternalPriceSpreadsheetError("SOURCE_FILE_HASH_MISMATCH");
      const format = requiredText(job.fileFormat) as ExternalPriceFileFormat;
      const priceSchema = requiredText(job.priceSchema) as ExternalPriceSchema;
      let mapping = mappingValue(job.confirmedMapping);
      const hadConfirmedMapping = mapping !== null;
      const firstPass = analyzeExternalPriceSpreadsheet({ bytes, format, priceSchema, mapping });
      if (!mapping) {
        mapping = await this.repository.findTemplate(companyId, requiredText(job.sourceId), firstPass.detectedMapping.signature);
        if (!mapping) {
          await this.repository.completeDetection(uploadId, firstPass);
          return { status: "mapping_required", uploadId, durationMs: Math.round(performance.now() - startedAt) };
        }
        await this.repository.useTemplate(uploadId, mapping);
      }
      const analysis = hadConfirmedMapping ? firstPass : analyzeExternalPriceSpreadsheet({ bytes, format, priceSchema, mapping });
      const candidates = await this.repository.listCandidates();
      const matches = matchExternalPriceRows(analysis.rows, candidates);
      await this.repository.saveMatches(uploadId, companyId, requiredText(job.currency), matches, analysis);
      return { status: "ready_for_review", uploadId, durationMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      const code = error instanceof ExternalPriceSpreadsheetError ? error.code : "ANALYSIS_FAILED";
      await this.repository.failJob(uploadId, companyId, code);
      console.error({ event: "external_price_analysis_failed", uploadId, companyId, safeErrorCode: code, errorType: error instanceof Error ? error.name : typeof error });
      return { status: "failed", uploadId, durationMs: Math.round(performance.now() - startedAt) };
    }
  }
}

function requiredText(value: unknown): string { if(typeof value!=="string"||!value.trim())throw new Error("INVALID_JOB"); return value; }
function mappingValue(value: unknown): ExternalPriceColumnMapping | null { return value&&typeof value==="object"&&!Array.isArray(value)&&typeof (value as ExternalPriceColumnMapping).productName==="string" ? value as ExternalPriceColumnMapping : null; }
