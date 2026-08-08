import "server-only";

import { createHash } from "node:crypto";

import { hashSerial, maskSerial, normalizeSerial, protectSerial, WarrantySerialValidationError } from "@/src/modules/warranty-serials/serial-security";
import type { OneCServiceHistoryProvider, OneCServiceSerialProvider } from "./one-c-service-history.provider";
import type { ServiceHistoryRepository } from "./repository";

export class ServiceHistorySyncService {
  constructor(
    private readonly provider: OneCServiceHistoryProvider,
    private readonly repository: ServiceHistoryRepository,
    private readonly serialProvider?: OneCServiceSerialProvider,
  ) {}

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

  async runSerialEnrichmentStep() {
    const started = performance.now();
    if (!this.serialProvider) return { status: "idle" as const, rowsProcessed: 0, durationMs: elapsed(started) };
    const claim = await this.repository.claimSerialEnrichment();
    if (!claim) return { status: "idle" as const, rowsProcessed: 0, durationMs: elapsed(started) };
    try {
      const resolutions = await this.serialProvider.resolve(claim.rows.map((row) => row.serialRef));
      const rows = claim.rows.map((row) => protectResolution(row.id, row.serialRef, resolutions.get(row.serialRef.toLowerCase())!));
      const publication = await this.repository.publishSerialEnrichment({ claim, rows });
      console.info({
        event: "one_c_service_history_serial_enrichment_published",
        runId: claim.runId,
        rowsProcessed: rows.length,
        pageComplete: claim.pageComplete,
        durationMs: elapsed(started),
      });
      return { status: claim.pageComplete ? "completed" as const : "progressed" as const, rowsProcessed: rows.length, publication, durationMs: elapsed(started) };
    } catch (error) {
      const safeCode = (error instanceof Error ? error.name : typeof error).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 100);
      try { await this.repository.failSerialEnrichment(claim, safeCode); } catch { /* Preserve the provider failure. */ }
      console.error({ event: "one_c_service_history_serial_enrichment_failed", runId: claim.runId, safeCode });
      throw error;
    }
  }

  async runSerialEnrichmentBatch(maxSteps = 20, maxDurationMs = 240_000) {
    const started = performance.now();
    let steps = 0;
    let rowsProcessed = 0;
    while (steps < maxSteps && performance.now() - started < maxDurationMs) {
      const result = await this.runSerialEnrichmentStep();
      if (result.status === "idle") return { status: steps ? "progressed" : "idle", steps, rowsProcessed, durationMs: elapsed(started) };
      steps += 1;
      rowsProcessed += result.rowsProcessed;
      if (result.status === "completed") return { status: "completed", steps, rowsProcessed, durationMs: elapsed(started) };
    }
    return { status: "progressed", steps, rowsProcessed, durationMs: elapsed(started) };
  }
}

function elapsed(started: number) { return Math.round(performance.now() - started); }

function protectResolution(id: string, serialRef: string, resolution: { state: "resolved" | "unmapped" | "conflict"; value: string | null; sourceFingerprint: string }) {
  if (resolution.state !== "resolved" || !resolution.value) return {
    id,
    serial_ref: serialRef,
    resolution_state: resolution.state,
    serial_source_fingerprint: resolution.sourceFingerprint,
  };
  try {
    const normalized = normalizeSerial(resolution.value);
    return {
      id,
      serial_ref: serialRef,
      resolution_state: "resolved",
      serial_hash: hashSerial(normalized),
      protected_serial: protectSerial(normalized),
      masked_serial: maskSerial(normalized),
      serial_source_fingerprint: createHash("sha256").update(`${resolution.sourceFingerprint}|${normalized}`, "utf8").digest("hex"),
    };
  } catch (error) {
    if (!(error instanceof WarrantySerialValidationError)) throw error;
    return {
      id,
      serial_ref: serialRef,
      resolution_state: "conflict",
      serial_source_fingerprint: resolution.sourceFingerprint,
    };
  }
}
