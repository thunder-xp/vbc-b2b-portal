import "server-only";

import type { OneCServiceHistoryProvider } from "./one-c-service-history.provider";
import type { ServiceHistoryRepository } from "./repository";

export class ServiceHistorySyncService {
  constructor(private readonly provider: OneCServiceHistoryProvider, private readonly repository: ServiceHistoryRepository) {}

  async runStep() {
    const started = performance.now();
    const claim = await this.repository.claim();
    if (!claim) return { status: "idle" as const, durationMs: elapsed(started) };
    try {
      const page = await this.provider.fetchPage({ skip: claim.skip, top: claim.pageSize, rangeStart: claim.rangeStart, rangeEnd: claim.rangeEnd });
      const publication = await this.repository.publish({
        claim,
        rows: page.rows.map((row) => ({
          source_document_ref: row.sourceDocumentRef,
          source_document_number: row.sourceDocumentNumber,
          source_document_date: row.sourceDocumentDate,
          source_posted: row.sourcePosted,
          source_deletion_mark: row.sourceDeletionMark,
          source_data_version: row.sourceDataVersion,
          source_status_ref: row.sourceStatusRef,
          source_status: row.sourceStatus,
          normalized_status: row.normalizedStatus,
          counterparty_ref: row.counterpartyRef,
          product_ref: row.productRef,
          characteristic_ref: row.characteristicRef,
          serial_ref: row.serialRef,
          contract_ref: row.contractRef,
          service_center_ref: row.serviceCenterRef,
          reported_fault: row.reportedFault,
          source_repair_description: row.sourceRepairDescription,
          source_sale_reference: row.sourceSaleReference,
          source_fingerprint: row.sourceFingerprint,
        })),
        pageComplete: page.pageComplete,
      });
      console.info({ event: "one_c_service_history_page_published", runId: claim.runId, skip: claim.skip, rowsReceived: page.rows.length, pageComplete: page.pageComplete, durationMs: elapsed(started) });
      return { status: page.pageComplete ? "completed" as const : "progressed" as const, runId: claim.runId, rowsReceived: page.rows.length, publication, durationMs: elapsed(started) };
    } catch (error) {
      const safeCode = (error instanceof Error ? error.name : typeof error).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 100);
      try { await this.repository.fail(claim, safeCode); } catch { /* Preserve the provider failure. */ }
      console.error({ event: "one_c_service_history_sync_failed", runId: claim.runId, skip: claim.skip, safeCode });
      throw error;
    }
  }

  async runBatch(maxSteps = 20, maxDurationMs = 240_000) {
    const started = performance.now();
    let steps = 0;
    let rowsReceived = 0;
    let runId: string | undefined;
    while (steps < maxSteps && performance.now() - started < maxDurationMs) {
      const result = await this.runStep();
      if (result.status === "idle") return { status: steps ? "progressed" : "idle", steps, rowsReceived, runId, durationMs: elapsed(started) };
      steps += 1;
      runId = result.runId;
      rowsReceived += result.rowsReceived;
      if (result.status === "completed") return { status: "completed", steps, rowsReceived, runId, durationMs: elapsed(started) };
    }
    return { status: "progressed", steps, rowsReceived, runId, durationMs: elapsed(started) };
  }
}

function elapsed(started: number) { return Math.round(performance.now() - started); }
